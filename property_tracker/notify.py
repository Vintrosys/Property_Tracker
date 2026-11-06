"""Tell a user about something on a property: Desk bell notification + push to their devices."""

import frappe
from frappe.utils import strip_html


def notify(user, subject, doc, kind="Alert", body=None):
	if not user or user == "Guest":
		return
	frappe.get_doc(
		{
			"doctype": "Notification Log",
			"for_user": user,
			"type": kind,
			"subject": subject,
			"email_content": body,
			"document_type": doc.doctype,
			"document_name": doc.name,
			"from_user": frappe.session.user,
		}
	).insert(ignore_permissions=True)
	try:
		from property_tracker.webpush import send_to_user

		send_to_user(
			user,
			{
				"title": strip_html(subject)[:120],
				"body": strip_html(body or "")[:200],
				"tag": f"{doc.name}-{kind}",
				"url": f"/property-tracker#p/{doc.name}",
			},
		)
	except Exception:
		frappe.log_error(title="Property Tracker notification push failed")
