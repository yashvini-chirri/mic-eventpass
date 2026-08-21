const insightService = require("../services/insightService");

async function getInsight(req, res) {
  try {
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ success: false, message: "question is required" });
    const stats = await insightService.getEventStats(req.params.eventId);
    const result = await insightService.answerInsight(question, stats);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Error generating event insight:", error);
    return res.status(error.message === "Event not found" ? 404 : 500).json({ success: false, message: error.message });
  }
}

module.exports = { getInsight };