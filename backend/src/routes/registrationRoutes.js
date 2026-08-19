const express = require("express");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

router.post("/", registrationController.registerForEvent);
router.get("/", registrationController.getRegistrations);
module.exports = router;