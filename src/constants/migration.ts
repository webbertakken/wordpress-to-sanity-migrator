import { MigrationStep } from '../types/migration'

export const MIGRATION_STEPS: MigrationStep[] = [
  {
    title: 'Docker Management',
    description: 'Start or stop the Docker container for the migration process.',
  },
  {
    title: 'Prepare Migration',
    description: 'Run the migration preparation script and generate the migration data.',
    link: '/verify-migration',
  },
  {
    title: 'Verify Migration',
    description: 'Visually inspect and verify the migration data before import.',
  },
  {
    title: 'Import to Sanity',
    description: 'Import the prepared migration data to your Sanity CMS project.',
  },
]
