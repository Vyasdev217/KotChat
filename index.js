var http = require('https');
const express = require("express");
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const app       = express();
const fs        = require('fs');
const config = JSON.parse(fs.readFileSync('../config.json'));
const server    = http.createServer({key: fs.readFileSync('../certs/private.key'),cert: fs.readFileSync('../certs/cert.pem'),}, app);
//const server    = http.createServer(app);
app.set('view engine', 'ejs');
app.set('views', __dirname+'/views');
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
const { Utils } = require('./app_modules/utils.js');
const { DictMongoDB } = require('./app_modules/dictmongodb.js');
let chatrooms = {};
let access_tokens = {};
let users = {};
let db = new DictMongoDB(config["KOTCHAT_MONGO_CONNECTION_STRING"]);
let isReady = false;

function triphash(tripcode){
    let hash = require('crypto').createHash('sha256').update(tripcode + config.hashsalt).digest('hex');
    return hash.substring(0, 15);
}
class Chatroom {
    constructor(name, admin_uid, password = "", max_users = 20, immortal = false){
        let id;
        while (true){
            id = Utils.randstr(100);
            if (chatrooms[id] == undefined){
                this.id = id;
                break;
            }
        }
        this.name = name;
        this.admin_uid = admin_uid;
        this.password = password;
        this.max_users = max_users;
        this.uids = [];
        this.messages = [];
        this.bannedIPs = [];
        this.created = Date.now();
        this.lastActive = Date.now();
        this.immortal = immortal
    }
    init(){
        setInterval(() => {
            this.pulseCheck();
        }, 300000);
        this.pulseCheck()
    }
    addUser(uid){
        if (this.uids.includes(uid)) return [400, "Already in chatroom"];
        if (this.bannedIPs.includes(users[uid].ip)) return [400, "Banned"];
        if (this.uids.length >= this.max_users) return [400, "Room is full"];
        if (users[uid].chatroom != undefined) return [400, "Already in a chatroom"];
        this.uids.push(uid);
        users[uid].chatroom = this.id;
        this.lastActive = Date.now();
        this.addSystemMessage(users[uid].handlename + " enterd the chat room");
        return [200, "Added user"];
    }
    removeUser(uid){
        if (!this.uids.includes(uid)) return [400, "Not in chatroom"]
        this.uids = this.uids.filter(id => id != uid);
        users[uid].chatroom = undefined;
        if(this.admin_uid == uid){ this.admin_uid = this.uids[0]; }
        this.lastActive = Date.now();
        if(this.uids.length == 0 && !this.immortal) delete chatrooms[this.id];
        return [200, "Removed user"];
    }
    addMessage(uid, message){
        if(!this.uids.includes(uid)) return [400, "Not in chatroom"]
        else this.messages.push({id: Utils.randstr(20), handlename: users[uid].handlename, triphash: users[uid].triphash, message: message});
        if(this.messages.length > 50){ this.messages.shift(); }
        this.lastActive = Date.now();
        return [200, "Message added"]
    }
    addSystemMessage(message){
        this.messages.push({id: Utils.randstr(20), handlename: "SERVER", triphash: 0, message: message});
        this.lastActive = Date.now();
        return [200, "System message added"]
    }
    kickUser(uid, ban = false){
        if(uid=="0") return [400, "Cannot kick admin"]
        if (ban && !this.bannedIPs.includes(users[uid].ip)) this.bannedIPs.push(users[uid].ip);
        this.removeUser(uid);
        this.addSystemMessage(users[uid].handlename + " was kicked");
        return [200, "User kicked"];
    }
    updateMaxUser(max_users){
        this.max_users = max_users;
        return [200, "Max users updated"]
    }
    updateRoomName(name){
        this.name = name;
        return [200, "Room name updated"]
    }
    handoverAdmin(uid){
        this.admin_uid = uid;
        this.addSystemMessage(users[uid].handlename + " is admin now");
        return [200, "Admin handed over"]
    }
    pulse(){
        this.lastActive = Date.now();
        return [200, "Pulse sent"]
    }
    pulseCheck(){
        for(let i=0;i<this.uids.length;i++){
            if(users[this.uids[i]].lastseen < (Date.now() - 30000)){
                this.removeUser(this.uids[i]);
                this.addSystemMessage(users[this.uids[i]].handlename + " was kicked due to inactivity");
            }
        }
        if (Date.now() - this.lastActive > 1200000 && !this.immortal){
            for (let i = 0; i < this.uids.length; i++){
                this.removeUser(this.uids[i]);
            }
            delete chatrooms[this.id];
        }
    }
    fetch(){
        let usrs = [];
        for (let i = 0; i < this.uids.length; i++){
            let uid = this.uids[i];
            usrs.push({uid: uid, handlename: users[uid].handlename, triphash: users[uid].triphash});
        }
        this.lastActive = Date.now();
        return [200, {
            id: this.id,
            name: this.name,
            admin_uid: this.admin_uid,
            password: this.password,
            max_users: this.max_users,
            users: usrs,
            messages: this.messages,
            bannedIPs: this.bannedIPs,
            created: this.created,
            lastActive: this.lastActive
        }];
    }
}

async function init(){
    await db.initialize("KotChat", ["data"]);
    function saveState(){
        db["data"].updateOne({id: "stateBackup"}, {$set: {chatrooms: chatrooms, access_tokens: access_tokens, users: users}}, {upsert: true});
    }
    function loadState(){
        db["data"].find({id: "stateBackup"}).toArray().then((data) => {
            if(data.length == 0) return;
            chatrooms = {};
            for(let room_id in data[0].chatrooms){
                chatrooms[room_id] = new Chatroom(data[0].chatrooms[room_id].name, data[0].chatrooms[room_id].admin_uid, data[0].chatrooms[room_id].password, data[0].chatrooms[room_id].max_users, data[0].chatrooms[room_id].immortal);
                chatrooms[room_id].id = room_id;
                chatrooms[room_id].uids = data[0].chatrooms[room_id].uids;
                chatrooms[room_id].messages = data[0].chatrooms[room_id].messages;
                chatrooms[room_id].bannedIPs = data[0].chatrooms[room_id].bannedIPs;
                chatrooms[room_id].created = data[0].chatrooms[room_id].created;
                chatrooms[room_id].lastActive = data[0].chatrooms[room_id].lastActive;
            }
            access_tokens = data[0].access_tokens;
            users = data[0].users;
        });
    }
    function cleanOldTokens(){
        for (let token in access_tokens){
            if (users[access_tokens[token]] == undefined) delete access_tokens[token];
            else if(users[access_tokens[token]].lastseen < Date.now() - 86400000) delete access_tokens[token];
        }
    }
    loadState();
    cleanOldTokens();
    if(chatrooms["immortal_daredemo"] == undefined){
        chatrooms["immortal_daredemo"] = new Chatroom("誰でも雑談", "0", "", 100, true);
        chatrooms["immortal_daredemo"].id = "immortal_daredemo";
        chatrooms["immortal_daredemo"].init();
    }
    setInterval(() => {
        saveState();
        cleanOldTokens();
    }, 60000);
    isReady = true;
}
init();

app.use((req, res, next) => {
    if(isReady) next();
    else res.status(503).send("Service Unavailable");
});

function auth(access_token){
    let uid = access_tokens[access_token];
    if (uid == undefined){ return [401, "Unauthorized"]; }
    return [200, uid];
}

app.get("/login", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ if(users[temp[1]].chatroom != undefined) res.redirect("/room"); else res.redirect("/lounge"); }
    else { res.status(200).render("login.ejs"); }
});

app.post("/login", async (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ if(users[temp[1]].chatroom != undefined) res.redirect("/room"); else res.redirect("/lounge"); }
    else{
        let handlename = req.body.handlename;
        let icon = req.body.icon;
        let tripcode = req.body.tripcode;
        let user = {
            handlename: handlename,
            icon: icon,
            triphash: triphash(tripcode),
            ip: req.ip,
            chatroom: undefined,
            lastseen: Date.now()
        };
        let uid = Utils.randstr(100);
        users[uid] = user;
        let access_token = Utils.randstr(100);
        access_tokens[access_token] = uid;
        res.cookie("access_token", access_token);
        res.redirect("/lounge");
    }
});

app.get("/create", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ if(users[temp[1]].chatroom != undefined) res.redirect("/room"); else res.status(200).render("create.ejs"); }
    else{ res.redirect("/login"); }
});

function validateRoom(name, password, max_users){
    let issues = [];
    if(name == undefined || name == "") issues.push("Invalid name");
    if(name.length > 15) issues.push("Name too long");
    if(password.length > 100) issues.push("Password too long");
    if(max_users < 2 || max_users > 100) issues.push("Invalid max users");
    return issues;
}

app.post("/create", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ 
        if(users[temp[1]].chatroom != undefined) res.redirect("/room"); 
        else {
            let issues = validateRoom(req.body.name, req.body.password, req.body.max_users);
            if(issues.length > 0){ res.status(400).send(issues); return; }
            let chatroom = new Chatroom(req.body.name, temp[1], req.body.password, req.body.max_users);
            chatrooms[chatroom.id] = chatroom; chatrooms[chatroom.id].init(); chatrooms[chatroom.id].addUser(temp[1]);
            res.redirect("/room");
        } 
    }
    else{ res.redirect("/login"); }
});

app.get("/lounge", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ 
        if(users[temp[1]].chatroom != undefined) res.redirect("/room");
        else {
            let cr={};
            for(let rid in chatrooms){
                let uids = chatrooms[rid].uids;
                let members = [];
                for(let j=0;j<uids.length;j++){
                    members.push({handlename: users[uids[j]].handlename, triphash: users[uids[j]].triphash});
                }
                cr[rid] = {
                    name: chatrooms[rid].name,
                    max_users: chatrooms[rid].max_users,
                    user_count: chatrooms[rid].uids.length,
                    members: members
                };
            };
            res.status(200).render("lounge.ejs", {handlename: users[temp[1]].handlename, triphash: users[temp[1]].triphash, chatrooms: cr});
        }
    }
    else res.redirect("/login");
});

app.get("/join/:room_id", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] != 200){ res.status(temp[0]).send(temp[1]); return; }
    let room = chatrooms[req.params.room_id];
    if(room == undefined){ res.status(404).send("Chatroom not found"); return; }
    let password = req.query.password || "";
    if(room.password == password){
        let ret = room.addUser(temp[1]);
        if(ret[0] != 200){ res.status(ret[0]).send(ret[1]); return; }
        res.redirect("/room");
    }
    else{
        res.render("join.ejs", {room_name: room.name});
        return;

    }
});

app.get("/room", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ 
        let room = chatrooms[users[temp[1]].chatroom];
        if(room == undefined){ users[temp[1]].chatroom=undefined; res.redirect("/login"); return; }
        res.status(200).render("room.ejs");
    }
    else{
        res.redirect("/login");
    }
    
});

app.post("/room", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] != 200){ res.status(temp[0]).send(temp[1]); return; }
    let room = chatrooms[users[temp[1]].chatroom];
    if(room == undefined){ res.status(404).send("Chatroom not found"); return; }
    let action = req.body.action;
    if(action == "fetch"){
        users[temp[1]].lastseen = Date.now();
        let ret = room.fetch();
        ret[1].isAdmin = (ret[1].admin_uid == temp[1]) || ("0" == temp[1]);
        res.status(ret[0]).send(ret[1]);
    }
    if(action == "send"){
        if(req.body.message == undefined || req.body.message == "" || req.body.message.length > 500){ res.status(400).send("Invalid message"); return; }
        let ret = room.addMessage(temp[1], req.body.message);
        res.status(ret[0]).send(ret[1]);
    }
    if(action == "leave"){
        let ret = room.removeUser(temp[1]);
        if (ret[0] == 200) room.addSystemMessage(users[temp[1]].handlename + " left the chat room");
        res.redirect("/lounge");
    }
    if(action == "kick"){
        if(!room.uids.includes(temp[1])){ res.status(400).send("Not in chatroom"); return; }
        if(room.admin_uid != temp[1] && temp[1] != "0"){ res.status(403).send("Unauthorized"); return; }
        let ret = room.kickUser(req.body.target_uid);
        res.status(ret[0]).send(ret[1]);
    }
    if(action == "updateMaxUsers"){
        if(room.admin_uid != temp[1] && temp[1] != "0"){ res.status(403).send("Unauthorized"); return; }
        let ret = room.updateMaxUser(req.body.max_users);
        res.status(ret[0]).send(ret[1]);
    }
    if(action == "updateRoomName"){
        if(room.admin_uid != temp[1] && temp[1] != "0"){ res.status(403).send("Unauthorized"); return; }
        let ret = room.updateRoomName(req.body.name);
        res.status(ret[0]).send(ret[1]);
    }
    if(action == "handoverAdmin"){
        if(room.admin_uid != temp[1] && temp[1] != "0"){ res.status(403).send("Unauthorized"); return; }
        let ret = room.handoverAdmin(req.body.target_uid);
        res.status(ret[0]).send(ret[1]);
    }
});

app.get("/logout", (req, res) => { res.clearCookie("access_token"); res.redirect("/login"); });

app.get("/", (req, res) => {
    let temp = auth(req.cookies["access_token"]);
    if(temp[0] == 200){ 
        if(users[temp[1]].chatroom != undefined) res.redirect("/room");
        else res.redirect("/lounge");    
    }
    else res.redirect("/login");
});

app.get("/public/:file", (req, res) => {
    res.sendFile(__dirname + "/public/" + req.params.file);
});

app.post("/su", (req, res) => {
    let password = req.body.password;
    if(password == fs.readFileSync("../password.txt").toString().trim()){
        let access_token = Utils.randstr(100);
        access_tokens[access_token] = "0";
        users["0"] = {
            handlename: "Kot",
            icon: "",
            triphash: "admin",
            ip: "0",
            chatroom: undefined,
            lastseen: Date.now()
        };
        res.cookie("access_token", access_token);
        res.redirect("/lounge");
    }
    else res.status(401).send("Unauthorized");
});

server.listen(443, () => {
    console.log("Server is listening on port 443");
});