const registrationService = require("../services/registrationService");

async function registerForEvent(req, res) {
  try {
    const { eventId, attendeeId } = req.body;

    if (!eventId || !attendeeId) {
      return res.status(400).json({
        success: false,
        message: "eventId and attendeeId are required",
      });
    }

    const registration = await registrationService.registerForEvent(
      eventId,
      attendeeId
    );

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
module.exports = {
  registerForEvent,
  getRegistrations,
};