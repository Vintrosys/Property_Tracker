"""Whitelisted API used by the /property-tracker page.

Records are exchanged in the compact shape the page works with
(``id``, ``lat``, ``punit`` …) so the UI stays close to the original
standalone app. ``to_client`` / ``apply_client`` translate between that
shape and the Property DocType.
"""

import base64
import datetime
import json
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime
from frappe.utils.data import get_system_timezone

# client key -> Property fieldname
FIELD_MAP = {
	"name": "site_title",
	"type": "property_type",
	"locality": "locality",
	"district": "district",
	"addr": "address",
	"lat": "latitude",
	"lng": "longitude",
	"area": "area",
	"unit": "area_unit",
	"len": "length",
	"wid": "width",
	"road": "road_width",
	"facing": "facing",
	"owner": "owner_name",
	"phone": "phone",
	"price": "expected_price",
	"punit": "price_unit",
	"notes": "notes",
	"neg": "negotiated_price",
	"rating": "rating",
	"source": "source",
	"broker": "broker_name",
	"bphone": "broker_phone",
	"comm": "commission",
	"assign": "assigned_to",
}
NUMERIC = {"lat", "lng", "area", "len", "wid", "road", "price", "neg"}


def check_app_permission():
	"""Used by the apps screen (hooks.add_to_apps_screen)."""
	return frappe.has_permission("Property", "read")


# ---------------------------------------------------------------- helpers


def _tz():
	return ZoneInfo(get_system_timezone())


def to_iso(value):
	"""Naive system-timezone datetime -> ISO string with offset (safe for JS Date)."""
	if not value:
		return None
	return get_datetime(value).replace(tzinfo=_tz()).isoformat()


def from_iso(value):
	"""ISO string from the browser (usually UTC 'Z') -> naive system-timezone datetime."""
	if not value:
		return None
	try:
		dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
	except ValueError:
		return get_datetime(value)
	if dt.tzinfo:
		dt = dt.astimezone(_tz()).replace(tzinfo=None)
	return dt


def _blank_zero(value):
	return value if value else ""


def to_client(doc, photos=(), visits=(), history=(), docs=(), prices=()):
	p = {"id": doc.name, "status": doc.status, "created": to_iso(doc.creation), "by": doc.owner, "modified": to_iso(doc.modified)}
	for key, field in FIELD_MAP.items():
		value = doc.get(field)
		p[key] = _blank_zero(value) if key in NUMERIC else (value or "")
	try:
		p["boundary"] = json.loads(doc.boundary) if doc.boundary else None
	except ValueError:
		p["boundary"] = None
	p["barea"] = flt(doc.boundary_area_sqft) or ""
	p["photos"] = [{"d": r.image, "at": to_iso(r.taken_on), "c": r.caption or ""} for r in photos]
	p["docs"] = [
		{"i": r.idx, "type": r.doc_type, "status": r.status or "Pending", "file": r.file or "", "note": r.note or "", "at": to_iso(r.updated_on)}
		for r in docs
	]
	p["prices"] = [
		{"at": to_iso(r.logged_on), "kind": r.kind, "amount": flt(r.amount), "note": r.note or "", "by": r.logged_by or ""}
		for r in prices
	]
	p["visits"] = [{"at": to_iso(r.visited_on), "note": r.note} for r in visits]
	p["history"] = [
		{"at": to_iso(r.changed_on), "from": r.from_status or "", "to": r.to_status, "note": r.note or ""}
		for r in history
	]
	return p


def doc_to_client(doc):
	return to_client(doc, doc.photos, doc.visits, doc.status_history, doc.documents, doc.price_history)


def apply_client(doc, data):
	for key, field in FIELD_MAP.items():
		if key not in data:
			continue
		value = data.get(key)
		if key in NUMERIC:
			value = flt(value) if value not in (None, "") else None
		elif key == "rating":
			value = str(cint(value)) if cint(value) else ""
		doc.set(field, value)
	if "boundary" in data:
		b = data.get("boundary")
		doc.boundary = json.dumps(b) if isinstance(b, dict | list) else (b or None)


def _save_photos(doc, photos):
	"""Keep existing photo URLs; store new data-URL photos as private Files on the doc."""
	rows = []
	for i, photo in enumerate(photos or []):
		src = (photo or {}).get("d") or ""
		taken_on = from_iso(photo.get("at")) or now_datetime()
		if src.startswith("data:"):
			header, _sep, payload = src.partition(",")
			ext = "png" if "image/png" in header else "jpg"
			file = frappe.get_doc(
				{
					"doctype": "File",
					"file_name": f"{doc.name}-{frappe.generate_hash(length=6)}.{ext}",
					"attached_to_doctype": "Property",
					"attached_to_name": doc.name,
					"is_private": 1,
					"content": base64.b64decode(payload),
				}
			).insert()
			src = file.file_url
		elif not src:
			continue
		rows.append({"image": src, "taken_on": taken_on, "caption": (photo.get("c") or "")[:140]})
		if i >= 49:
			break
	doc.set("photos", rows)


def _parse(data):
	if isinstance(data, str):
		data = json.loads(data)
	return frappe._dict(data or {})


def _get(name, ptype="write"):
	doc = frappe.get_doc("Property", name)
	doc.check_permission(ptype)
	return doc


# ---------------------------------------------------------------- reads


@frappe.whitelist()
def get_data():
	"""All properties (with photos, visits and history) plus the user's reminders."""
	props = frappe.get_list("Property", fields=["*"], order_by="creation asc", limit_page_length=0)
	names = [p.name for p in props]

	def children(doctype, order):
		grouped = {}
		if names:
			for row in frappe.get_all(
				doctype, filters={"parent": ("in", names), "parenttype": "Property"}, fields=["*"], order_by=order
			):
				grouped.setdefault(row.parent, []).append(row)
		return grouped

	photos = children("Property Photo", "idx asc")
	visits = children("Property Visit", "visited_on asc")
	history = children("Property Status Log", "idx asc")
	docs = children("Property Document", "idx asc")
	prices = children("Property Price Log", "logged_on asc")

	reminders = frappe.get_list(
		"Property Reminder",
		filters={"owner": frappe.session.user},
		fields=["name", "reminder", "due_on", "property", "done"],
		order_by="due_on asc",
		limit_page_length=0,
	)
	return {
		"props": [
			to_client(
				p,
				photos.get(p.name, ()),
				visits.get(p.name, ()),
				history.get(p.name, ()),
				docs.get(p.name, ()),
				prices.get(p.name, ()),
			)
			for p in props
		],
		"rem": [reminder_to_client(r) for r in reminders],
		"user": frappe.session.user,
		"me": get_profile(),
		"team": get_team(),
	}


def get_team():
	"""People who use the tracker: for assigning properties and @mentions."""
	users = frappe.get_all(
		"Has Role",
		filters={"role": ("in", ["Property Manager", "System Manager"]), "parenttype": "User"},
		pluck="parent",
		distinct=True,
	)
	rows = frappe.get_all(
		"User",
		filters=[["name", "in", [u for u in users if u != "Guest"] or [""]], ["enabled", "=", 1], ["user_type", "=", "System User"]],
		fields=["name", "full_name", "user_image"],
		order_by="full_name asc",
	)
	return [{"user": r.name, "name": r.full_name or r.name, "image": r.user_image or ""} for r in rows]


def get_profile():
	"""The signed-in user, for the Account screen."""
	user = frappe.session.user
	u = frappe.db.get_value(
		"User", user, ["full_name", "first_name", "email", "user_image", "last_login", "creation"], as_dict=True
	) or frappe._dict()
	roles = frappe.get_roles(user)
	return {
		"user": user,
		"full_name": u.full_name or user,
		"first_name": u.first_name or (u.full_name or user).split(" ")[0],
		"email": u.email or user,
		"image": u.user_image or "",
		"roles": [r for r in ("Administrator", "System Manager", "Property Manager") if r in roles],
		"last_login": to_iso(u.last_login),
		"member_since": to_iso(u.creation),
		"added": frappe.db.count("Property", {"owner": user}),
		"desk": frappe.db.get_value("User", user, "user_type") == "System User",
		"phone": frappe.db.get_value("User", user, "mobile_no") or frappe.db.get_value("User", user, "phone") or "",
	}


# ---------------------------------------------------------------- property writes


@frappe.whitelist(methods=["POST"])
def save_property(data, name=None):
	data = _parse(data)
	if name:
		doc = _get(name)
	else:
		doc = frappe.new_doc("Property")
		doc.status = data.get("status") or "Visited"
	apply_client(doc, data)
	if not name:
		doc.insert()
	if "photos" in data:
		_save_photos(doc, data.photos)
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def delete_property(name):
	for r in frappe.get_all("Property Reminder", filters={"property": name}, pluck="name"):
		frappe.db.set_value("Property Reminder", r, "property", None)
	frappe.delete_doc("Property", name)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def set_status(name, status, note=None):
	doc = _get(name)
	if doc.status != status:
		doc.status = status
		doc.flags.status_note = note or ""
		doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def log_visit(name, note):
	if not (note or "").strip():
		frappe.throw(_("Visit note is required"))
	doc = _get(name)
	doc.append("visits", {"visited_on": now_datetime(), "note": note.strip()})
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def update_deal(name, negotiated_price=None, rating=None):
	doc = _get(name)
	apply_client(doc, {"neg": negotiated_price, "rating": rating})
	doc.save()
	return doc_to_client(doc)


DOC_STATUSES = ("Pending", "Received", "Verified", "Issue")
PRICE_KINDS = ("Asking", "Offered", "Counter", "Negotiated", "Final")


@frappe.whitelist(methods=["POST"])
def set_document(name, doc_type, status=None, note=None, file=None, row=None):
	"""Add or update one entry of the document checklist (row = its idx when editing)."""
	doc = _get(name)
	if status and status not in DOC_STATUSES:
		frappe.throw(_("Unknown document status"))
	target = None
	if row:
		target = next((d for d in doc.documents if d.idx == cint(row)), None)
	elif doc_type != "Other":
		target = next((d for d in doc.documents if d.doc_type == doc_type), None)
	if not target:
		target = doc.append("documents", {"doc_type": doc_type})
	target.doc_type = doc_type
	if status:
		target.status = status
	if note is not None:
		target.note = note
	if file is not None:
		target.file = file or None
	target.updated_on = now_datetime()
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def remove_document(name, row):
	doc = _get(name)
	doc.set("documents", [d for d in doc.documents if d.idx != cint(row)])
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def add_price(name, kind, amount, note=None):
	"""Price history entry; negotiated/final amounts also become the negotiated price."""
	if kind not in PRICE_KINDS:
		frappe.throw(_("Unknown price type"))
	if flt(amount) <= 0:
		frappe.throw(_("Enter an amount"))
	doc = _get(name)
	doc.append("price_history", {"logged_on": now_datetime(), "kind": kind, "amount": flt(amount), "note": note or "", "logged_by": frappe.session.user})
	if kind in ("Negotiated", "Final"):
		doc.negotiated_price = flt(amount)
	doc.flags.skip_price_log = True
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist(methods=["POST"])
def assign(name, user=None):
	doc = _get(name)
	if user and not frappe.db.exists("User", {"name": user, "enabled": 1}):
		frappe.throw(_("Unknown user"))
	doc.assigned_to = user or None
	doc.save()
	return doc_to_client(doc)


@frappe.whitelist()
def get_comments(name):
	_get(name, "read")
	rows = frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Property", "reference_name": name, "comment_type": "Comment"},
		fields=["name", "content", "owner", "creation"],
		order_by="creation asc",
	)
	return [
		{"k": r.name, "html": r.content, "by": r.owner, "who": frappe.utils.get_fullname(r.owner), "at": to_iso(r.creation)}
		for r in rows
	]


@frappe.whitelist(methods=["POST"])
def add_comment(name, text, mentions=None):
	"""Comment on a property. @Name for users in `mentions` becomes a Frappe mention, which notifies them."""
	from html import escape

	doc = _get(name, "read")
	text = (text or "").strip()
	if not text:
		frappe.throw(_("Write a comment"))
	html = escape(text).replace("\n", "<br>")
	mentioned = []
	for user in _parse_list(mentions):
		full = frappe.utils.get_fullname(user)
		token = escape(f"@{full}")
		if frappe.db.exists("User", {"name": user, "enabled": 1}) and token in html:
			span = f'<span class="mention" data-id="{escape(user)}" data-value="{escape(full)}" data-denotation-char="@"><span>@{escape(full)}</span></span>'
			html = html.replace(token, span, 1)
			mentioned.append(user)
	comment = doc.add_comment("Comment", f"<div>{html}</div>")
	# Frappe notifies mentioned users in Desk; also push to their devices.
	from property_tracker.webpush import send_to_user

	for user in set(mentioned) - {frappe.session.user}:
		try:
			send_to_user(user, {"title": f"{frappe.utils.get_fullname(frappe.session.user)} mentioned you", "body": text[:200], "tag": f"{doc.name}-c", "url": f"/property-tracker#p/{doc.name}"})
		except Exception:
			frappe.log_error(title="Property Tracker mention push failed")
	return get_comments(name)


@frappe.whitelist(methods=["POST"])
def delete_comment(name, comment):
	c = frappe.get_doc("Comment", comment)
	if c.reference_doctype != "Property" or c.reference_name != name:
		frappe.throw(_("Not a comment on this property"))
	if c.owner != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("You can only delete your own comments."), frappe.PermissionError)
	c.delete(ignore_permissions=True)
	return get_comments(name)


def _parse_list(value):
	if not value:
		return []
	if isinstance(value, str):
		value = json.loads(value)
	return list(value)


# ---------------------------------------------------------------- reminders


def reminder_to_client(r):
	return {"k": r.name, "t": r.reminder, "due": to_iso(r.due_on), "p": r.property or "", "done": bool(r.done)}


@frappe.whitelist(methods=["POST"])
def add_reminder(reminder, due_on, property=None):
	doc = frappe.get_doc(
		{
			"doctype": "Property Reminder",
			"reminder": reminder,
			"due_on": from_iso(due_on),
			"property": property or None,
		}
	).insert()
	return reminder_to_client(doc)


@frappe.whitelist(methods=["POST"])
def set_reminder_done(name, done):
	doc = frappe.get_doc("Property Reminder", name)
	doc.done = cint(done)
	doc.save()
	return reminder_to_client(doc)


def _remove_reminders(names):
	"""Delete reminders and their Desk bell notifications."""
	for name in names:
		frappe.db.delete("Notification Log", {"document_type": "Property Reminder", "document_name": name})
		frappe.delete_doc("Property Reminder", name, ignore_permissions=True, force=True)
	return len(names)


@frappe.whitelist(methods=["POST"])
def delete_reminder(name):
	"""Delete one of your own reminders."""
	owner = frappe.db.get_value("Property Reminder", name, "owner")
	if not owner:
		return {"deleted": 0}
	if owner != frappe.session.user:
		frappe.throw(_("You can only delete your own reminders."), frappe.PermissionError)
	return {"deleted": _remove_reminders([name])}


@frappe.whitelist(methods=["POST"])
def clear_done_reminders():
	"""Delete all of your reminders that are marked done."""
	names = frappe.get_all("Property Reminder", filters={"owner": frappe.session.user, "done": 1}, pluck="name")
	return {"deleted": _remove_reminders(names)}


# ---------------------------------------------------------------- import


@frappe.whitelist(methods=["POST"])
def import_backup(data):
	"""Import a "Backup JSON" file exported by the old standalone (localStorage) app."""
	data = _parse(data)
	id_map = {}
	for old in data.get("props") or []:
		old = frappe._dict(old)
		doc = frappe.new_doc("Property")
		doc.status = old.status or "Visited"
		apply_client(doc, old)
		if not (-90 <= flt(doc.latitude) <= 90 and -180 <= flt(doc.longitude) <= 180):
			doc.latitude = doc.longitude = None  # old app allowed any typed value
		for v in old.visits or []:
			doc.append("visits", {"visited_on": from_iso(v.get("at")) or now_datetime(), "note": v.get("note") or "-"})
		history = old.history or []
		for h in history:
			doc.append(
				"status_history",
				{
					"changed_on": from_iso(h.get("at")),
					"from_status": h.get("from") or "",
					"to_status": h.get("to"),
					"note": h.get("note") or "",
				},
			)
		if history:
			# history came from the backup; don't add a fresh "Created" row
			doc.flags.skip_status_log = True
		doc.insert()
		if old.photos:
			_save_photos(doc, old.photos)
			doc.save()
		if old.created:
			frappe.db.set_value("Property", doc.name, "creation", from_iso(old.created), update_modified=False)
		id_map[old.id] = doc.name

	reminders = 0
	for r in data.get("rem") or []:
		if not (r.get("t") and r.get("due")):
			continue
		frappe.get_doc(
			{
				"doctype": "Property Reminder",
				"reminder": r["t"],
				"due_on": from_iso(r["due"]),
				"property": id_map.get(r.get("p")),
				"done": cint(r.get("done")),
			}
		).insert()
		reminders += 1

	return {"properties": len(id_map), "reminders": reminders}


# ---------------------------------------------------------------- reminder alerts (Web Push)


def _device_name(user_agent):
	ua = user_agent or ""
	os_name = next((n for k, n in (("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"), ("Windows", "Windows"), ("Mac OS", "Mac"), ("Linux", "Linux")) if k in ua), "Device")
	browser = next((n for k, n in (("Edg/", "Edge"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari")) if k in ua), "browser")
	return f"{browser} on {os_name}"


@frappe.whitelist()
def get_push_config():
	from property_tracker.webpush import get_vapid_keys

	from frappe.utils.scheduler import get_scheduler_tick

	public_key, _key = get_vapid_keys()
	# Frappe's scheduler only checks jobs every `scheduler_tick_interval` seconds (4 minutes by
	# default in v16), so browser alerts can arrive up to about that long after the due time.
	return {"public_key": public_key, "delay_minutes": max(1, round(get_scheduler_tick() / 60))}


@frappe.whitelist(methods=["POST"])
def save_push_subscription(subscription, user_agent=None):
	"""Register (or refresh) this browser for reminder alerts for the current user."""
	from property_tracker.webpush import SUBSCRIPTION, endpoint_hash

	subscription = _parse(subscription)
	keys = subscription.get("keys") or {}
	endpoint = subscription.get("endpoint") or ""
	if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
		frappe.throw(_("Invalid push subscription"))

	name = endpoint_hash(endpoint)
	values = {
		"user": frappe.session.user,
		"device": _device_name(user_agent),
		"endpoint": endpoint,
		"p256dh": keys["p256dh"],
		"auth": keys["auth"],
	}
	if frappe.db.exists(SUBSCRIPTION, name):
		doc = frappe.get_doc(SUBSCRIPTION, name)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": SUBSCRIPTION, "endpoint_hash": name, **values}).insert(ignore_permissions=True)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def delete_push_subscription(endpoint):
	from property_tracker.webpush import SUBSCRIPTION, endpoint_hash

	name = endpoint_hash(endpoint or "")
	if frappe.db.get_value(SUBSCRIPTION, name, "user") == frappe.session.user:
		frappe.delete_doc(SUBSCRIPTION, name, ignore_permissions=True, force=True)
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def send_test_push():
	from property_tracker.webpush import send_to_user

	return send_to_user(
		frappe.session.user,
		{
			"title": "🔔 Property Tracker",
			"body": "Reminder alerts are working on this device.",
			"tag": "pt-test",
			"url": "/property-tracker#rem",
		},
	)
