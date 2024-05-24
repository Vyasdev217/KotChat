const { MongoClient } = require('mongodb');

class DictMongoDB{
    constructor(connection_string, log=true){
        this.connection_string = connection_string;
        this.client = new MongoClient(connection_string);
        this.log = log
        if (this.client==undefined){ console.log("DictMongoDB>>> CONNECTION FAILED"); }
    }
    async initialize(db_name, collections=undefined, create_db_if_not_exists=true){
        if(this.client==undefined){ console.log("DictMongoDB>>> CONNECTION FAILED"); return; }
        if(this.log) console.log("DictMongoDB[%s]>>> CONNECTING", db_name);
        await this.client.connect();
        if(this.log) console.log("DictMongoDB[%s]>>> INITIALIZING OBJECT", db_name);
        const db_list = await this.client.db().admin().listDatabases();
        const db_names = db_list.databases.map(db => db.name);
        let db_exists = db_names.includes(db_name);
        if (!create_db_if_not_exists && !db_exists){ 
            if(this.log)console.log("DictMongoDB[%s]>>> DATABASE NOT FOUND", db_name); 
            return; 
        }
        this.db = this.client.db(db_name);
        if (collections==undefined){
            collections = await this.db.listCollections().toArray();
            collections = collections.map(col => col.name);
            for(const collection in collections){ this[collection] = this.db.collection(collection); };
        }
        else{
            const db_collections = await this.db.listCollections().toArray();
            const collectionNames = db_collections.map(col => col.name);
            for(const collection of collections){
                if (!collectionNames.includes(collection)) { await this.db.createCollection(collection); }
                this[collection] = this.db.collection(collection);
            };
        }
        if(this.log)console.log("DictMongoDB[%s]>>> READY", db_name);
    }
    async initCollection(collection){
        const collections = await this.db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);
        if (!collectionNames.includes(collection)) { await this.db.createCollection(collection); }
        this[collection] = this.db.collection(collection);
    }

}

module.exports = { DictMongoDB };