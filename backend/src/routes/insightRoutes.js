const express = require("express");
const insightController = require("../controllers/insightController");
const { requireProfile, requireRole } = require("../middleware/auth");

const router = express.Router();
router.post("/:eventId", requireProfile, requireRole("organizer"), insightController.getInsight);
module.exports = router;