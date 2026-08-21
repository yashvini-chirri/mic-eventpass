const { createClient } = require("@supabase/supabase-js");
const pool = require("../config/db");

async function requireProfile(req, res, next) {
  const authorization = req.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: "Bearer access token is required",
    });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({
      success: false,
      message: "Supabase Auth is not configured on the server",
    });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

    const result = await pool.query(
      "SELECT id, name, email, role FROM public.profiles WHERE id = $1",
      [data.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Authenticated profile not found",
      });
    }

    req.user = result.rows[0];
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication service unavailable",
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Required role: ${roles.join(" or ")}`,
      });
    }

    return next();
  };
}

module.exports = {
  requireProfile,
  requireRole,
};