const express = require("express");
const eventController = require("../controllers/eventController");
const { requireProfile, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", eventController.getEvents);

router.post(
	"/",
	requireProfile,
	requireRole("organizer"),
	eventController.createEvent
);

module.exports = router;