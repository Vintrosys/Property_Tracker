# Copyright (c) 2026, ponsakthivel k and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate


def execute(filters=None):
	"""Site visits per week: logged visits and new properties, for the last N weeks."""
	filters = frappe._dict(filters or {})
	to_date = getdate(filters.to_date or nowdate())
	from_date = getdate(filters.from_date or add_days(to_date, -7 * 12))
	start = add_days(from_date, -from_date.weekday())  # Monday of the first week

	visible = frappe.get_list("Property", pluck="name", limit_page_length=0)  # respects permissions
	visits = frappe.get_all(
		"Property Visit",
		filters={"parenttype": "Property", "parent": ("in", visible or [""]), "visited_on": ("between", [start, f"{to_date} 23:59:59"])},
		fields=["parent", "visited_on"],
	)
	added = frappe.get_all(
		"Property",
		filters={"name": ("in", visible or [""]), "creation": ("between", [start, f"{to_date} 23:59:59"])},
		fields=["creation"],
	)

	weeks, d = [], start
	while d <= to_date:
		weeks.append(d)
		d = add_days(d, 7)
	idx = lambda dt: (getdate(dt) - start).days // 7
	rows = [{"week": w, "visits": 0, "properties": set(), "added": 0} for w in weeks]
	for v in visits:
		i = idx(v.visited_on)
		if 0 <= i < len(rows):
			rows[i]["visits"] += 1
			rows[i]["properties"].add(v.parent)
	for a in added:
		i = idx(a.creation)
		if 0 <= i < len(rows):
			rows[i]["added"] += 1
	data = [{"week": r["week"], "visits": r["visits"], "properties": len(r["properties"]), "added": r["added"]} for r in rows]

	columns = [
		{"fieldname": "week", "label": _("Week starting"), "fieldtype": "Date", "width": 140},
		{"fieldname": "visits", "label": _("Visits logged"), "fieldtype": "Int", "width": 130},
		{"fieldname": "properties", "label": _("Properties visited"), "fieldtype": "Int", "width": 150},
		{"fieldname": "added", "label": _("New properties"), "fieldtype": "Int", "width": 130},
	]
	chart = {
		"data": {
			"labels": [frappe.format(r["week"], {"fieldtype": "Date"}) for r in data],
			"datasets": [{"name": _("Visits logged"), "values": [r["visits"] for r in data]}, {"name": _("New properties"), "values": [r["added"] for r in data]}],
		},
		"type": "line",
		"colors": ["#1f6f50", "#b7791f"],
	}
	return columns, data, None, chart
