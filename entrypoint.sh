#!/bin/bash

# Exit on any error
set -e

echo "🚀 Starting SDLC application..."

# Function to wait for database to be ready
wait_for_db() {
    echo "⏳ Waiting for database to be ready..."

    max_attempts=30
    attempt=1

    while [ $attempt -le $max_attempts ]; do
        if node -e "
            import pg from 'pg';
            import dotenv from 'dotenv';
            dotenv.config();

            const client = new pg.Client({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });

            client.connect()
                .then(() => {
                    console.log('✅ Database connection successful');
                    return client.end();
                })
                .then(() => process.exit(0))
                .catch((error) => {
                    console.log('❌ Database connection failed:', error.message);
                    process.exit(1);
                });
        " 2>/dev/null; then
            echo "✅ Database is ready!"
            break
        else
            echo "🔄 Database not ready, attempt $attempt/$max_attempts..."
            sleep 2
            attempt=$((attempt + 1))
        fi
    done

    if [ $attempt -gt $max_attempts ]; then
        echo "💥 Database connection timeout after $max_attempts attempts"
        exit 1
    fi
}

# Function to run database migrations
run_migrations() {
    echo "🔄 Running database migrations..."

    if node migrate.js; then
        echo "✅ Database migrations completed successfully"
    else
        echo "💥 Database migrations failed"
        exit 1
    fi
}

# Function to install dependencies if needed
install_dependencies() {
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        echo "📦 Installing dependencies..."
        npm install --production
        echo "✅ Dependencies installed"
    else
        echo "✅ Dependencies already installed"
    fi
}

# Main execution flow
main() {
    echo "🏗️  Preparing application..."

    # Install dependencies if needed
    install_dependencies

    # Wait for database to be ready
    wait_for_db

    # Run database migrations
    run_migrations

    echo "🎉 Application setup completed successfully"
    echo "🚀 Starting main application..."

    # Start the main application
    exec npm start
}

# Handle signals gracefully
trap 'echo "🛑 Received shutdown signal, stopping application..."; exit 0' SIGTERM SIGINT

# Run main function
main "$@"