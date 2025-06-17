const express = require('express');
const sqlite3 = require('better-sqlite3');
const hashids = require('hashids');
const crypto = require('crypto');
const fileupload = require('express-fileupload');
const fs = require('fs');
const sharp = require('sharp');


if(!fs.existsSync('./storage')) {
    fs.mkdirSync('./storage');
}
if(!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp');
}
if(!fs.existsSync('./sqlite')) {
    fs.mkdirSync('./sqlite');
}

const db = sqlite3('./sqlite/uploadedimages.sl3', {});


db.exec('create table if not exists images(filename text, id integer primary key autoincrement)');
db.exec('create table if not exists tags(tag text, ref_id integer, foreign key(ref_id) references images(id))');
db.exec('create table if not exists configuration(salt text, port integer, imagesize integer)');

const loadConf = db.prepare('select * from configuration');

let port = 0;
let salt = '';

let conf = loadConf.get();
if(conf != undefined) {
    port = conf['port'];
    salt = conf['salt'];
}
else {
    db.prepare('insert into configuration(salt, port) values(?, ?)').run(crypto.createHash('md5').update(Date.now().toString()).digest('hex'), 13000);
    conf = loadConf.get();
    port = conf['port'];
    salt = conf['salt'];
}

const app = express();
const hid = new hashids(salt, 25);

app.set('view engine', 'hbs');
app.use(express.static('./public'));
app.use(fileupload({ useTempFiles: true, tempFileDir: './temp' }));
app.use(express.json());

app.post('/api/v1/uploadfile', function(req, res) {
    if(!req.files) {
        res.statusCode = 400;
        res.send(`400: expected 1 file | got 0.`);
        return;
    }
    if(Object.keys(req.files).length != 1) {
        res.statusCode = 400;
        res.send(`400: expected 1 file | got ${Object.keys(req.files).length}.`);
        return;
    }
    if(!req.files.image) {
        res.statusCode = 400;
        res.send(`400: expected 1 file named 'image' | got '${Object.keys(req.files)[0]}'.`);
        return;
    }
    if(req.files.image.length) {
        res.statusCode = 400;
        res.send(`400: expected 1 file | got ${req.files.image.length}.`);
        return;
    }

    if(!req.body) {
        res.statusCode = 400;
        res.send(`400: request body is null.`);
        return;
    }
    if(Object.keys(req.body).length != 1 || !req.body.tags || /^\s*$/.test(req.body.tags)) {
        res.statusCode = 400;
        res.send(`400: bad request body.`);
        return;
    }
    let imageid = db.prepare(`insert into images default values returning id`).get();
    db.prepare(`update images set filename = ? where id = ?`).run(hid.encode(imageid.id) + '.' + req.files.image.name.split('.').pop(), imageid.id);
        
    req.files.image.mv('./storage/' + imageid.id + '.' + req.files.image.name.split('.').pop());
        
    sharp('./storage/' + imageid.id + '.' + req.files.image.name.split('.').pop())
    .resize(200, 200, { fit: sharp.fit.inside })
    .jpeg({ quality: 90 })
    .toFile('./storage/thumbnail_' + imageid.id + '.jpg')
    .then(function(){
        for(let tag of req.body.tags.trim().toLowerCase().split(/\s+/)) {
            db.prepare('insert into tags(tag, ref_id) values(?, ?)').run(encodeURIComponent(tag), imageid.id);
        }
        res.redirect('/view?uid=' + hid.encode(imageid.id))
    }).catch(function() {
        res.statusCode = 500;
        res.send(`500: cannot resize image.`);
        fs.rmSync('./storage/' + imageid.id + '.' + req.files.image.name.split('.').pop());
        db.prepare(`delete from images where id = ?`).run(imageid.id);
    });
});
app.post('/api/v1/gettags', function(req, res) {
    if(!req.body) {
        res.statusCode = 400;
        res.send(`400: request body is null.`);
        return;
    }
    if(Object.keys(req.body).length != 1 || !req.body.tag || /^\s*$/.test(req.body.tag)) {
        res.statusCode = 400;
        res.send(`400: bad request body.`);
        return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(db.prepare(`select distinct tag from tags where tag like ? || '%' limit 10`).all(req.body.tag)));
});

app.get('/images', function(req, res) {
    let page = 0;
    let found = [];

    let maxcount = 0;
    let pagebuttons = [];
    if(req.query.page)
        page = Number(req.query.page);

    if(!req.query.search || req.query.search == '*') {
        let founddb = db.prepare('select filename, id from images order by id desc limit 28 offset ?').all(page*28);
        maxcount = Math.floor(db.prepare('select count(id) from images').get()['count(id)'] / 28);
        for(let img of founddb) {
            found.push( { url: '/view?uid=' + hid.encode(img.id), imageurl: '/storage/' + img.filename + "?thumbnail=true" } );
        }
    }
    else if(req.query.search.startsWith("uid:")) {
        try {
            let founddb = db.prepare('select filename from images where id = ?').get(hid.decode(req.query.search.substring(4, req.query.search.length)));
            found.push( { url: '/view?uid=' + req.query.search.substring(4, req.query.search.length), imageurl: '/storage/' + founddb.filename + "?thumbnail=true" } );
        }
        catch {
            found.push( { url: '/view?uid=notfound', imageurl: '/img/notfound.png' } );
        }
    }
    else if(req.query.search.startsWith("tag:")) {
        let founddb = db.prepare('select filename, id from images where exists(select ref_id from tags where ref_id == id and tag == ?) and not exists(select ref_id from tags where ref_id == id and tag != ?) order by id desc limit 28 offset ?').all(req.query.search.substring(4, req.query.search.length), req.query.search.substring(4, req.query.search.length), page*28);
        for(let img of founddb) {
            found.push( {url: 'view?uid=' + hid.encode(img.id), imageurl: '/storage/' + img.filename + "?thumbnail=true" } );
        }
        let rawconut = db.prepare('select count(id) from images where exists(select ref_id from tags where ref_id == id and tag == ?) and not exists(select ref_id from tags where ref_id == id and tag != ?)').get(req.query.search.substring(4, req.query.search.length), req.query.search.substring(4, req.query.search.length))['count(id)'] / 28
        if(rawconut == Math.floor(rawconut)) {
            maxcount = rawconut-1;
        }
        else {
            maxcount = Math.floor(rawconut);
        }
    }
    else {
        let founddb = [];
        let tags = req.query.search.trim().split(/\s+/);
        let countcommand = 'select count(id) from images where '
        let command = 'select filename, id from images where ';
        let subcondition = 'exists(select ref_id from tags where ref_id == id and tag == ?)'
        
        for(let i = 0; i < tags.length - 1; i++) {
            if(tags[i].startsWith('-')) {
                tags[i] = tags[i].substring(1, tags[i].length);
                command += 'not ';
                countcommand += 'not ';
            }
            command += subcondition + ' and ';
            countcommand += subcondition + ' and ';
        }
        
        if(tags[tags.length-1].startsWith('-')) {
            tags[tags.length-1] = tags[tags.length-1].substring(1, tags[tags.length-1].length);
            command += ' not ';
            countcommand += ' not ';
        }
        countcommand += subcondition;
        command += subcondition;
        command += ' order by id desc limit 28 offset ?';
        founddb = db.prepare(command).all(tags, page*28);
        let rawconut = db.prepare(countcommand).get(tags)['count(id)'] / 28
        if(rawconut == Math.floor(rawconut)) {
            maxcount = rawconut-1;
        }
        else {
            maxcount = Math.floor(rawconut);
        }
        for(let i of founddb) {
            found.push( { url: '/view?uid=' + hid.encode(i.id), imageurl: '/storage/' + i.filename + "?thumbnail=true" } );
        }
    }
    if(maxcount < 9) {
        for(let i = 0; i < maxcount+1; i++) {
            pagebuttons.push( { count: i, isActive: i==page, searchedtext: req.query.search } );
        }
    }
    else if(maxcount < page + 8) {
        for(let i = 9; i > 1; i--) {
            pagebuttons.push( { count: maxcount+2 - i, isActive: maxcount+2-i==page, searchedtext: req.query.search } );
        }
    }
    else {
        for(let i = 0; i < 9; i++) {
            pagebuttons.push( { count: page + i, isActive: page-i==page, searchedtext: req.query.search } );
        }
    }

    res.render('viewimages.hbs', {
        searchedtext: req.query.search,
        images: found,
        pagebuttons: { isfirst: page < 1, islast: page + 1 > maxcount, last: maxcount, next: page + 1, back: page - 1 },
        orderedbuttons: pagebuttons
    });
});
app.get('/view', function(req, res) {
    let filename = './img/notfound.png';
    let tags = [];
    try {
        filename = './storage/' + db.prepare(`select filename from images where id == ?`).get(hid.decode(req.query.uid))['filename'];
        tags = db.prepare('select tag from tags inner join images on ref_id == ? where id == ?').all(hid.decode(req.query.uid), hid.decode(req.query.uid));
    }
    catch {

    }
    res.render('viewsingle.hbs', {
        uid: req.query.uid,
        tags: tags,
        filename: filename
    });
});
app.get('/storage/:uid', function(req, res) {
    let fileuid = hid.decode(req.params.uid.split('.')[0]);
    let prefix = "";
    let ext = "." + req.params.uid.split('.')[1];
    if(req.query.thumbnail === "true") {
        prefix = "thumbnail_";
        ext = ".jpg";
    }
    if(fileuid.length === 0) {
        res.render('notfound.hbs', {
            url: req.path
        });
        return;
    }
    if(fs.existsSync('./storage/' + fileuid + req.params.uid.substring(25))) {
        res.writeHead(200, {
            "Content-Type": "image/" + ext.slice(1),
            "Content-Disposition": "inline; filename=\"" + prefix + req.params.uid.slice(0, 25) + ext + "\""
        });
        fs.createReadStream('./storage/' + prefix + fileuid + ext).pipe(res);
        return;
    }
    res.render('notfound.hbs', {
        url: req.path
    });
});

app.use('/', function(req, res) {
    res.render('notfound.hbs', {
        url: req.path
    });
});

app.listen(port, function() {
    console.log('http://localhost:' + port);
});