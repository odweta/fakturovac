const app = require('./app');
const { initializeDatabase } = require('./db');

const port = 3001;

initializeDatabase()
  .then(() => app.listen(port, () => {
    console.log(`App listening on port ${port}`);
  }))
  .catch((error) => {
    console.error('Unable to initialize database', error);
    process.exit(1);
  });