# Copyright (c) 2026, ponsakthivel k and contributors
# For license information, please see license.txt

import json
import math

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

EARTH_RADIUS_M = 6378137
SQFT_PER_SQM = 10.7639

# Square feet per unit of area.
AREA_UNIT_SQFT = {"Sq.ft": 1, "Cent": 435.6, "Acre": 43560, "Ground": 2400, "Sq.m": 10.764}
# Square feet covered by one unit of a per-area price.
PRICE_UNIT_SQFT = {"Per Sq.ft": 1, "Per Cent": 435.6, "Per Acre": 43560, "Per Ground": 2400}


class Property(Document):
	def validate(self):
		self.validate_location()
		self.set_boundary_area()
		self.set_area()
		self.set_prices()
		self.track_status_change()
		self.track_asking_price()

	def on_update(self):
		self.notify_assignee()

	def set_boundary_area(self):
		"""The boundary is GeoJSON (Geolocation field); store its measured area in sq.ft."""
		ring = boundary_ring(self.boundary)
		if self.boundary and ring is None:
			frappe.throw(_("The plot boundary is not a valid shape. Draw it again with at least 3 corners."))
		self.boundary_area_sqft = flt(polygon_area_sqm(ring) * SQFT_PER_SQM, 2) if ring else 0

	def track_asking_price(self):
		"""Log the asking price whenever it changes, so the price history shows it moving."""
		if self.flags.skip_price_log or not flt(self.total_price):
			return
		prev = self.get_doc_before_save()
		if prev and flt(prev.total_price, 2) == flt(self.total_price, 2):
			return
		unit = "" if self.price_unit in (None, "", "Total") else f" ({flt(self.expected_price):,.0f} {self.price_unit.lower()})"
		self.append(
			"price_history",
			{"logged_on": now_datetime(), "kind": "Asking", "amount": self.total_price, "note": f"Asking price{unit}", "logged_by": frappe.session.user},
		)

	def notify_assignee(self):
		prev = self.get_doc_before_save()
		user = self.assigned_to
		if not user or (prev and prev.assigned_to == user) or user == frappe.session.user:
			return
		from property_tracker.notify import notify

		notify(
			user,
			subject=_("{0} assigned {1} to you").format(frappe.utils.get_fullname(frappe.session.user), self.site_title or self.name),
			doc=self,
			kind="Assignment",
		)

	def validate_location(self):
		lat, lng = self.latitude, self.longitude
		if lat in (None, "") and lng in (None, ""):
			return
		if flt(lat) == 0 and flt(lng) == 0:  # "0, 0" means not captured
			self.latitude = self.longitude = None
			return
		if not -90 <= flt(lat) <= 90 or not -180 <= flt(lng) <= 180 or lat in (None, "") or lng in (None, ""):
			frappe.throw(
				frappe._("Location {0}, {1} is not valid. Latitude must be between -90 and 90 and longitude between -180 and 180 (for example 11.132551, 77.780931).").format(lat, lng),
				title=frappe._("Invalid location"),
			)

	def set_area(self):
		"""Length, width and road width are in feet. With no area entered, use length × width
		(sq.ft) converted to the chosen area unit."""
		prev = self.get_doc_before_save()
		if prev and self.area and flt(self.area) == flt(prev.area) and _area_from_feet(prev) == flt(prev.area):
			# the area was calculated from length × width; keep it in step if those change
			if (flt(self.length), flt(self.width), self.area_unit) != (flt(prev.length), flt(prev.width), prev.area_unit):
				self.area = 0

		if not self.area and self.length and self.width:
			self.area = flt(flt(self.length) * flt(self.width) / AREA_UNIT_SQFT.get(self.area_unit or "Sq.ft", 1), 2)

		self.area_sqft = flt(self.area) * AREA_UNIT_SQFT.get(self.area_unit, 1) if self.area else 0

	def set_prices(self):
		price = flt(self.expected_price)
		if not price:
			self.total_price = 0
		elif self.price_unit == "Total" or not self.price_unit:
			self.total_price = price
		else:
			self.total_price = price * flt(self.area_sqft) / PRICE_UNIT_SQFT[self.price_unit]

		if self.area_sqft and self.total_price:
			self.price_per_sqft = self.total_price / self.area_sqft
			self.price_per_cent = self.price_per_sqft * AREA_UNIT_SQFT["Cent"]
		else:
			self.price_per_sqft = 0
			self.price_per_cent = 0

	def track_status_change(self):
		if self.flags.skip_status_log:
			return
		previous = self.get_doc_before_save()
		from_status = previous.status if previous else ""
		if previous and from_status == self.status:
			return

		self.append(
			"status_history",
			{
				"changed_on": now_datetime(),
				"from_status": from_status,
				"to_status": self.status,
				"note": self.flags.status_note or ("Created" if not previous else ""),
			},
		)


def boundary_ring(value):
	"""First polygon ring [[lng, lat], ...] from a GeoJSON value, or None."""
	if not value:
		return None
	try:
		data = json.loads(value) if isinstance(value, str) else value
	except ValueError:
		return None
	geoms = []
	if data.get("type") == "FeatureCollection":
		geoms = [f.get("geometry") or {} for f in data.get("features") or []]
	elif data.get("type") == "Feature":
		geoms = [data.get("geometry") or {}]
	else:
		geoms = [data]
	for g in geoms:
		if g.get("type") == "Polygon" and g.get("coordinates"):
			ring = [pt for pt in g["coordinates"][0] if isinstance(pt, list | tuple) and len(pt) >= 2]
			if len(ring) >= 4 and all(-180 <= flt(x) <= 180 and -90 <= flt(y) <= 90 for x, y, *_ in ring):
				return ring
	return None


def polygon_area_sqm(ring):
	"""Geodesic area of a lng/lat ring in square metres (same formula as Leaflet.draw)."""
	if not ring:
		return 0
	area = 0.0
	n = len(ring)
	for i in range(n):
		x1, y1 = ring[i][0], ring[i][1]
		x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
		area += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
	return abs(area * EARTH_RADIUS_M * EARTH_RADIUS_M / 2)


def _area_from_feet(doc):
	if not (doc.length and doc.width):
		return None
	return flt(flt(doc.length) * flt(doc.width) / AREA_UNIT_SQFT.get(doc.area_unit or "Sq.ft", 1), 2)
