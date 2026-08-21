const registrationService = require("../services/registrationService");

async function registerForEvent(req, res) {
  try {
    const { eventId, attendeeId } = req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "eventId is required",
      });
    }

    if (attendeeId && attendeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only register your own attendee profile",
      });
    }

    const registration = await registrationService.registerForEvent(
      eventId,
      req.user.id
    );

    req.app.get("io").emit("event:updated", { eventId });

    res.status(201).json({
      success: true,
      registration,
    });
  } catch (error) {
    console.error("Error registering for event:", error);

    if (error.message.includes("Already registered")) {
      return res.status(409).json({
        success: false,
        message: "Already registered for this event",
      });
    }

    if (error.message.includes("Event is full")) {
      return res.status(409).json({
        success: false,
        message: "Event is full",
      });
    }

    if (error.message.includes("Event not found")) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to register for event",
    });
  }
}
async function getRegistrations(req, res) {
  try {
    const registrations = await registrationService.getRegistrations();

    res.status(200).json({
      success: true,
      registrations,
    });
  } catch (error) {
    console.error("Error fetching registrations:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch registrations",
    });
  }
}

async function checkIn(req, res) {
  try {
    const { token, idempotencyKey, source } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    const checkin = await registrationService.checkInWithQrToken({
      rawToken: token,
      checkedInBy: req.user.id,
      idempotencyKey,
      source,
    });

    req.app.get("io").emit("event:updated", { eventId: checkin.eventId });

    return res.status(201).json({
      success: true,
      checkin,
    });
  } catch (error) {
    console.error("Error checking in attendee:", error);

    if (error.message.startsWith("Already checked in at")) {
      return res.status(409).json({ success: false, message: error.message });
    }

    if (["Invalid QR token", "QR token expired"].includes(error.message)) {
      return res.status(409).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to check in attendee",
    });
  }
}

async function getEventDashboard(req, res) {
  try {
    const dashboard = await registrationService.getEventDashboard(req.params.eventId);
    return res.status(200).json({ success: true, dashboard });
  } catch (error) {
    console.error("Error fetching event dashboard:", error);
    if (error.message === "Event not found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Failed to fetch event dashboard" });
  }
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportEvent(req, res) {
  try {
    const rows = await registrationService.getEventExport(req.params.eventId);
    const header = ["attendee_name", "attendee_email", "registered_at", "checked_in_at"];
    const csv = [header, ...rows.map((row) => [row.attendee_name, row.attendee_email, row.registered_at, row.checked_in_at])]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="event-${req.params.eventId}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Error exporting event:", error);
    return res.status(500).json({ success: false, message: "Failed to export event data" });
  }
}
module.exports = {
  registerForEvent,
  checkIn,
  getEventDashboard,
  exportEvent,
  getRegistrations,
};