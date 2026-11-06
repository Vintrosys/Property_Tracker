"""Printable one-page brochure for a property (/property-brochure?name=P0001).

Shows photos, key facts, the boundary and a map, with the signed-in user as the contact.
Owner name and phone are never included.
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, fmt_money, format_datetime

no_cache = 1
AREA_UNIT_SQFT = {"Sq.ft": 1, "Cent": 435.6, "Acre": 43560, "Ground": 2400, "Sq.m": 10.764}


def inr(v):
	return fmt_money(flt(v), precision=0, currency="INR") if flt(v) else "—"


def num(v):
	v = flt(v)
	return f"{v:,.2f}".rstrip("0").rstrip(".") if v else ""


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + frappe.utils.quote(frappe.request.full_path)
		raise frappe.Redirect
	name = frappe.form_dict.get("name")
	if not name or not frappe.db.exists("Property", name):
		frappe.throw(_("Property not found"), frappe.DoesNotExistError)
	doc = frappe.get_doc("Property", name)
	doc.check_permission("read")

	sqft = flt(doc.area_sqft)
	facts = [
		(_("Type"), doc.property_type),
		(_("Area"), f"{num(doc.area)} {doc.area_unit}" if doc.area else ""),
		(_("Area (sq.ft)"), f"{sqft:,.0f}" if sqft else ""),
		(_("Area (cent)"), num(sqft / 435.6) if sqft else ""),
		(_("Length × width"), f"{num(doc.length)} × {num(doc.width)} ft" if doc.length and doc.width else ""),
		(_("Road width"), f"{num(doc.road_width)} ft" if doc.road_width else ""),
		(_("Facing"), doc.facing),
		(_("Measured area (boundary)"), f"{num(flt(doc.boundary_area_sqft) / 435.6)} cent · {flt(doc.boundary_area_sqft):,.0f} sq.ft" if doc.boundary_area_sqft else ""),
		(_("Price"), inr(doc.total_price)),
		(_("Price per cent"), inr(doc.price_per_cent) if doc.price_per_cent else ""),
		(_("Price per sq.ft"), inr(doc.price_per_sqft) if doc.price_per_sqft else ""),
	]
	ok = doc.latitude is not None and doc.longitude is not None and -90 <= flt(doc.latitude) <= 90 and -180 <= flt(doc.longitude) <= 180 and not (flt(doc.latitude) == 0 and flt(doc.longitude) == 0)
	user = frappe.db.get_value("User", frappe.session.user, ["full_name", "email", "mobile_no", "phone"], as_dict=True) or {}
	data = {
		"lat": flt(doc.latitude) if ok else None,
		"lng": flt(doc.longitude) if ok else None,
		"boundary": json.loads(doc.boundary) if doc.boundary else None,
	}
	context.update(
		{
			"doc": doc,
			"title": doc.site_title or doc.name,
			"price": inr(doc.total_price),
			"location": ", ".join(x for x in [doc.address, doc.locality, doc.district] if x),
			"facts": [(k, v) for k, v in facts if v],
			"photos": [{"src": p.image, "caption": p.caption or ""} for p in doc.photos][:6],
			"docs_verified": sum(1 for d in doc.documents if d.status == "Verified"),
			"docs": [(d.doc_type if d.doc_type != "Other" else (d.note or d.doc_type), d.status) for d in doc.documents],
			"maps_url": f"https://www.google.com/maps?q={doc.latitude},{doc.longitude}" if ok else "",
			"contact": {"name": user.get("full_name") or frappe.session.user, "phone": user.get("mobile_no") or user.get("phone") or "", "email": user.get("email") or ""},
			"generated": format_datetime(frappe.utils.now_datetime(), "dd MMM yyyy"),
			"data_json": json.dumps(data).replace("</", "<\\/"),
			"no_breadcrumbs": True,
		}
	)
	return context
