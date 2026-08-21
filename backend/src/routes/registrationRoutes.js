const express = require("express");
const registrationController = require("../controllers/registrationController");
const { requireProfile, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post(
	"/",
	requireProfile,
	requireRole("attendee"),
	registrationController.registerForEvent
);
router.post(
	"/check-in",
	requireProfile,
	requireRole("organizer"),
	registrationController.checkIn
);
router.get(
	"/",
	requireProfile,
	requireRole("organizer"),
	registrationController.getRegistrations
);
	router.get(
		"/dashboard/:eventId",
		requireProfile,
		requireRole("organizer"),
		registrationController.getEventDashboard
	);
	router.get(
		"/export/:eventId",
		requireProfile,
		requireRole("organizer"),
		registrationController.exportEvent
	);
module.exports = router;