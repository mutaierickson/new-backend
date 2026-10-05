const n = (value) => Number(value || 0);

const handle = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  });
};

module.exports = { n, handle };
