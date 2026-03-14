require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config');

app.listen(config.port, () => {
  console.log(`Pharma DMS API running at http://localhost:${config.port}`);
  console.log(`  Health: http://localhost:${config.port}/api/health`);
});
