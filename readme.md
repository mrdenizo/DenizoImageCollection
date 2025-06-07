# Denizo's image collection

## About
Simple website written in Node.js for storing and searching images by tags.

## Installing
```sh
> git clone https://github.com/mrdenizo/DenizoImageCollection.git
> cd ./DenizoImageCollection
> npm install
> npm start
```
Browse `http://localhost:13000` after running `npm start`.

## Known issues

### Problem with installing `better-sqlite3` on Arch Linux and MacOS.

Possible solution:
* Downgrade `nodejs` to LTS.
    > tested with `nodejs-lts-jod-22.16.0-1` on Arch Linux.
    
    Run `pacman -S nodejs=22.16.0-1` to install LTS Node.js on Arch Linux.