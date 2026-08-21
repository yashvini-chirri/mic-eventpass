const eventService = require("../services/eventService");

async function getEvents(req, res) {
  try {
    const events = await eventService.getAllEvents();

    res.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch events",
    });
  }
}

async function createEvent(req, res) {
  try {
    const { name, eventDate, capacity } = req.body;
    const createdBy = req.user.id;

    if (!name || !eventDate || !capacity) {
      return res.status(400).json({
        success: false,
        message: "name, eventDate and capacity are required",
      });
    }

    const event = await eventService.createEvent({
      name,
      eventDate,
      capacity,
      createdBy,
    });

    req.app.get("io").emit("event:created", { eventId: event.id });

    res.status(201).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Error creating event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
}

module.exports = {
  getEvents,
  createEvent,
};