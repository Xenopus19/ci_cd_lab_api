import { Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('No DATABASE_URL in environment variables!');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: console.log,
});

const umzug = new Umzug({
  migrations: {
    glob: 'migrations/*.js',
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

async function runMigrations() {
  try {
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Connection successful.');

    console.log('Running migrations...');
    const migrations = await umzug.up();

    if (migrations.length === 0) {
      console.log('No new migrations. Database is up to date.');
    } else {
      console.log(`✅ Successfully applied migrations: ${migrations.length}`);
      migrations.forEach((m) => console.log(`   - ${m.name}`));
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error occurred during migrations:', error);
    await sequelize.close();
    process.exit(1); 
  }
}

runMigrations();