# iOS-project-BE
demo of iOS project using geolocation feature

### Steps for setting up BE-
1. Install Node.js and other required packages/libraries for intital set up of express server using Node.js and Postgres - pgadmin
2. Open repo iOS-project-BE from root directory of this project.
3. In root of this project, create a .env file and use keys with your values-
    PORT = <Backend_server_port>
    PGUSER=<Your_ppstgres_user_name>
    PGHOST=<your_pg_host>
    PGDATABASE=<Your_db_name>
    PGPASSWORD=<Your_pg_password>
    PGPORT=<Pg_port>
    REDIS_HOST=<Your_redis_server_host>
    REDIS_PORT=<Your_redis_port>

4. Ensure  "type": "module", is there in your package.json file which enables ECMAScript modules in project
5. run "npm install"
6. In one terminal, run "redis-server" to start redis server
7. In other terminal run "nodemon index.js" which starts our server
8. Try running your home route get call in browser which will display "Hello World" text on your screen.
9. After this is working fine, setup FE.
