# Copyright (c) 2026, ponsakthivel k and contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from property_tracker import api

# 1x1 transparent PNG
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


class IntegrationTestPropertyAPI(IntegrationTestCase):
	def test_property_lifecycle(self):
		p = api.save_property(
			{
				"name": "Corner Plot",
				"type": "Residential Land",
				"lat": "13.0827",
				"lng": "80.2707",
				"area": "5",
				"unit": "Cent",
				"price": "400000",
				"punit": "Per Cent",
				"photos": [{"d": PNG, "at": "2026-11-05T06:30:00.000Z"}],
			}
		)
		self.assertTrue(p["id"].startswith("P"))
		self.assertEqual(p["status"], "Visited")
		self.assertEqual(len(p["photos"]), 1)
		self.assertTrue(p["photos"][0]["d"].startswith("/private/files/"))
		self.assertEqual(len(p["history"]), 1)

		doc = frappe.get_doc("Property", p["id"])
		self.assertAlmostEqual(doc.total_price, 2000000)

		# editing keeps existing photo URLs without re-uploading
		p = api.save_property({"name": "Corner Plot (edited)", "photos": p["photos"]}, name=p["id"])
		self.assertEqual(p["name"], "Corner Plot (edited)")
		self.assertEqual(len(p["photos"]), 1)

		p = api.set_status(p["id"], "Negotiating", "Owner open to offers")
		self.assertEqual(p["history"][-1]["from"], "Visited")
		self.assertEqual(p["history"][-1]["note"], "Owner open to offers")

		p = api.log_visit(p["id"], "Second visit")
		self.assertEqual(p["visits"][-1]["note"], "Second visit")

		p = api.update_deal(p["id"], "1900000", "4")
		self.assertEqual(p["neg"], 1900000)
		self.assertEqual(p["rating"], "4")

		r = api.add_reminder("Call owner", "2026-11-06T04:30:00.000Z", p["id"])
		data = api.get_data()
		self.assertIn(p["id"], [x["id"] for x in data["props"]])
		self.assertIn(r["k"], [x["k"] for x in data["rem"]])

		api.set_reminder_done(r["k"], 1)
		self.assertEqual(frappe.db.get_value("Property Reminder", r["k"], "done"), 1)

		api.delete_property(p["id"])
		self.assertFalse(frappe.db.exists("Property", p["id"]))
		self.assertIsNone(frappe.db.get_value("Property Reminder", r["k"], "property"))

	def test_import_backup(self):
		backup = {
			"props": [
				{
					"id": "P0001",
					"name": "Old Plot",
					"type": "Vacant Land",
					"status": "Shortlisted",
					"created": "2026-01-10T05:00:00.000Z",
					"area": 2400,
					"unit": "Sq.ft",
					"photos": [{"d": PNG, "at": "2026-01-10T05:00:00.000Z"}],
					"visits": [{"at": "2026-01-12T05:00:00.000Z", "note": "Revisit"}],
					"history": [
						{"at": "2026-01-10T05:00:00.000Z", "from": "", "to": "Visited", "note": "Created"},
						{"at": "2026-01-11T05:00:00.000Z", "from": "Visited", "to": "Shortlisted", "note": ""},
					],
				}
			],
			"rem": [{"k": 1, "t": "Check EC", "due": "2026-02-01T05:00:00.000Z", "p": "P0001", "done": False}],
		}
		result = api.import_backup(backup)
		self.assertEqual(result, {"properties": 1, "reminders": 1})

		name = frappe.db.get_value("Property", {"site_title": "Old Plot"})
		doc = frappe.get_doc("Property", name)
		self.assertEqual(doc.status, "Shortlisted")
		self.assertEqual(len(doc.status_history), 2)
		self.assertEqual(len(doc.visits), 1)
		self.assertEqual(len(doc.photos), 1)
		self.assertEqual(str(doc.creation)[:4], "2026")
		self.assertEqual(frappe.db.get_value("Property Reminder", {"reminder": "Check EC"}, "property"), name)


class IntegrationTestPropertyFeatures(IntegrationTestCase):
	def new(self, **kw):
		return api.save_property({"name": "Feature plot", **kw})

	def test_boundary_area(self):
		# ~100 m x 100 m square near Erode (0.0009 deg lat ~ 100 m; lng scaled by cos(lat))
		import math

		lat, lng = 11.13, 77.78
		dlat, dlng = 0.000898315, 0.000898315 / math.cos(math.radians(lat))
		ring = [[lng, lat], [lng + dlng, lat], [lng + dlng, lat + dlat], [lng, lat + dlat], [lng, lat]]
		p = self.new(boundary={"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}]})
		self.assertAlmostEqual(p["barea"] / 107639, 1, delta=0.02)  # 1 hectare = 107,639 sq.ft
		self.assertEqual(p["boundary"]["type"], "FeatureCollection")
		with self.assertRaises(frappe.ValidationError):
			self.new(boundary={"type": "Polygon", "coordinates": [[[1, 1], [2, 2]]]})

	def test_asking_price_history_and_offers(self):
		p = self.new(price="500000", punit="Total")
		self.assertEqual([(x["kind"], x["amount"]) for x in p["prices"]], [("Asking", 500000)])
		p = api.save_property({"price": "480000"}, name=p["id"])
		self.assertEqual(p["prices"][-1]["amount"], 480000)
		p = api.save_property({"notes": "no price change"}, name=p["id"])
		self.assertEqual(len(p["prices"]), 2)
		p = api.add_price(p["id"], "Offered", 400000, "first offer")
		p = api.add_price(p["id"], "Negotiated", 450000)
		self.assertEqual([x["kind"] for x in p["prices"]], ["Asking", "Asking", "Offered", "Negotiated"])
		self.assertEqual(p["neg"], 450000)

	def test_documents_checklist(self):
		p = self.new()
		p = api.set_document(p["id"], "Patta / Chitta", status="Received", note="copy")
		p = api.set_document(p["id"], "Patta / Chitta", status="Verified")  # same type updates the row
		self.assertEqual([(d["type"], d["status"], d["note"]) for d in p["docs"]], [("Patta / Chitta", "Verified", "copy")])
		p = api.set_document(p["id"], "Other", note="survey report")
		p = api.set_document(p["id"], "Other", note="bank letter")  # "Other" can repeat
		self.assertEqual(len(p["docs"]), 3)
		p = api.remove_document(p["id"], p["docs"][0]["i"])
		self.assertEqual(len(p["docs"]), 2)

	def test_source_broker_photo_caption(self):
		p = self.new(source="Broker", broker="Ravi", bphone="+91 90000 00000", comm="2%", photos=[{"d": PNG, "c": "North side view"}])
		self.assertEqual((p["source"], p["broker"], p["comm"]), ("Broker", "Ravi", "2%"))
		self.assertEqual(p["photos"][0]["c"], "North side view")

	def test_assign_and_mentions(self):
		user = "pt-agent@example.com"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "Agent", "send_welcome_email": 0}).insert(ignore_permissions=True)
			u.add_roles("Property Manager")
		p = self.new()
		p = api.assign(p["id"], user)
		self.assertEqual(p["assign"], user)
		self.assertTrue(frappe.db.exists("Notification Log", {"for_user": user, "document_name": p["id"], "type": "Assignment"}))
		self.assertIn(user, [t["user"] for t in api.get_team()])
		comments = api.add_comment(p["id"], "Please visit tomorrow @Agent", [user])
		self.assertIn('data-id="pt-agent@example.com"', comments[-1]["html"])
		self.assertTrue(frappe.db.exists("Notification Log", {"for_user": user, "document_name": p["id"], "type": "Mention"}))
		comments = api.delete_comment(p["id"], comments[-1]["k"])
		self.assertEqual(comments, [])


class IntegrationTestPropertyVideos(IntegrationTestCase):
	def upload(self, prop, name, content):
		return frappe.get_doc(
			{"doctype": "File", "file_name": name, "attached_to_doctype": "Property", "attached_to_name": prop, "is_private": 1, "content": content}
		).insert()

	def test_add_caption_remove_video(self):
		p = api.save_property({"name": "Video plot"})
		f = self.upload(p["id"], "walkthrough.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 2048)
		p = api.add_video(p["id"], f.file_url, "Walk-through")
		self.assertEqual([(v["c"], v["d"]) for v in p["videos"]], [("Walk-through", f.file_url)])
		p = api.update_video(p["id"], p["videos"][0]["i"], "Road side")
		self.assertEqual(p["videos"][0]["c"], "Road side")
		p = api.remove_video(p["id"], p["videos"][0]["i"])
		self.assertEqual(p["videos"], [])
		self.assertFalse(frappe.db.exists("File", f.name))

	def test_rejects_non_video_and_too_large(self):
		p = api.save_property({"name": "Video plot 2"})
		f = self.upload(p["id"], "notes.txt", b"hello")
		with self.assertRaises(frappe.ValidationError):
			api.add_video(p["id"], f.file_url)
		self.assertFalse(frappe.db.exists("File", f.name))
		f = self.upload(p["id"], "big.mp4", b"0" * 2048)
		frappe.db.set_value("File", f.name, "file_size", 21 * 1048576)
		with self.assertRaises(frappe.ValidationError):
			api.add_video(p["id"], f.file_url)
