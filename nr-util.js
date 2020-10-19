// Simple utilities
"use strict";

exports.convertToBuffer= (d) => {

    try{
        if(Buffer.isBuffer(d)) return d; // if is a buffer nothing to do
        if(typeof d === "string") return Buffer.from(d);     // string -> Buffer in utf8
        if(d instanceof ArrayBuffer ) return Buffer.from(d); // ArrayBuffer -> Buffer
        if(typeof d === "boolean") {  // boolean is transformed to 0/1
            let b=Buffer.alloc(1);
            b.writeUInt8(( (d) ? 1: 0));
            return b;
        }
        if(typeof d === "number") { // Basic comverions of numbers as 32bit int or 32bit float
            let b=Buffer.alloc(4);
            if(Number.isInteger(d)) {
                b.writeUInt32LE(d);
            } else {
                b.writeFloatLE(d);
            }
            return b;
        }
        return null;
    } catch(err) {
        return null;
    }

};

exports.convertToString= function(d) {
    if(Buffer.isBuffer(d)) return d.toString(); // utf8
    if(typeof d === "string") return d;
    //node.error("RF24 not valid buffer to string conversion");
    return "";
};

const fs = require('fs');
const path = require('path');

exports.loadProfiles=function() {
    let bfile=path.join(__dirname,"boards.json");
    return new Promise((resolve,reject) => {
        fs.readFile(bfile, (err, data) => {
            if (err) reject(err);
            try {
                resolve(JSON.parse(data));
                
            } catch(e) {
                reject(e);
            }
        });
    });
};




