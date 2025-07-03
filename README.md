# WordPress to Sanity Migrator

A visual interface for migrating content from WordPress to Sanity CMS. This application streamlines
the migration process with database extraction, media processing, content transformation, and visual
verification.

## Features

- **Docker Container Management**: Start/stop WordPress database container with ingested backup
  through the UI
- **Database Extraction**: Connect to WordPress MySQL databases and extract posts, pages, and media
- **Content Transformation**: Automatically convert WordPress content to Sanity-compatible format
- **Media Processing**: Track and map media references with support for images, audio, and video
- **Visual Verification**: Review, search, filter, and export migrated content before final import
- **Tag Analysis**: Identify and analyze HTML tags and media references in content

## Installation

```bash
# Clone the repository
git clone https://github.com/webbertakken/wordpress-to-sanity-migrator.git
cd wordpress-to-sanity-migrator

# Install dependencies (use Yarn)
yarn install

# Start development server
yarn dev
```

## Usage

### 1. Prepare Your WordPress Data

Place your WordPress data in the `/input` directory:

- Database backup: `/input/backup.sql`
- Media files: `/input/uploads/` (maintain WordPress year/month structure)

### 2. Start Docker Container

Use the Docker Manager UI to start a MySQL container:

- Navigate to the Docker Management section
- Click "Start Container" to run WordPress database on localhost:3306

### 3. Run Migration

1. **Prepare Migration**: Extract and transform WordPress content
   - Connects to the database
   - Processes posts, pages, and media references
   - Outputs to `/input/sanity-migration.json`

2. **Verify Migration**: Review the migrated content
   - Search and filter posts
   - Check media reference integrity
   - Export selected content

### 4. Import to Sanity

Use the generated `sanity-migration.json` file with Sanity's import tools to complete the migration.

## Project Structure

```
wordpress-to-sanity-migrator/
├── src/
│   ├── app/           # Next.js app router pages
│   │   └── api/       # Server-side API routes
│   ├── components/    # React components
│   ├── domain/        # Business logic (DDD)
│   ├── types/         # TypeScript definitions
│   └── utils/         # Utility functions
├── input/             # Migration data directory
│   ├── uploads/       # WordPress media files
│   └── *.sql          # Database backups
└── public/            # Static assets
```

## Development

```bash
# Development server with Turbopack
yarn dev

# Run tests
yarn test
yarn test:watch    # Watch mode
yarn test:ui       # UI mode
yarn test:coverage # Coverage report

# Linting
yarn lint

# Build for production
yarn build
yarn start
```

## Configuration

The application expects a WordPress MySQL database with these default settings:

- Host: `localhost`
- Port: `3306`
- Database: `mydatabase`
- User: `root`
- Password: `rootpassword`

These can be modified in the Docker container configuration.

## Architecture

WordPress to Sanity Migrator follows Domain-Driven Design principles:

- **Frontend Layer**: React components for UI (`/src/components/`)
- **API Layer**: Next.js API routes for server operations (`/src/app/api/`)
- **Domain Layer**: Core business logic (`/src/domain/`)
- **Infrastructure**: Database connections, file system operations

### Key Components

- `DockerManagerUI`: Container lifecycle management
- `PrepareMigrationUI`: Content extraction and transformation
- `VerifyMigrationUI`: Migration review and export
- `MediaProcessor`: Media reference extraction and mapping
- `TagAnalyzer`: HTML content analysis

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use Yarn for package management (not npm)
- Follow Domain-Driven Design principles
- Write tests for business logic
- Ensure all code passes linting before commits
- Use conventional commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with:

- [Next.js 15](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vitest](https://vitest.dev/) - Testing framework
- [Docker](https://www.docker.com/) - Container management

## Support

For issues, questions, or contributions, please use the
[GitHub Issues](https://github.com/webbertakken/wordpress-to-sanity-migrator/issues) page.
