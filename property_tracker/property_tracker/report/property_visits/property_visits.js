// Copyright (c) 2026, ponsakthivel k and contributors
// For license information, please see license.txt

frappe.query_reports["Property Visits"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -84) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
	],
};
