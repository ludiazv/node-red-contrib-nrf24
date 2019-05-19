"use strict";

module.exports = function(RED) {

    const nrf24_module=require("nrf24");
    

    function RF24radio(n) {

        RED.nodes.createNode(this,n);
        var node = this;

        // Apply configurations
        node.used_by_stack=false;
        node.used=0;
        node.ce = parseInt(n.ce);
        node.cs = parseInt(n.cs);
        node.nrf24_module=nrf24_module;
        var irq= (n.irq === undefined) ? -1 : parseInt(n.irq);
        node.autorecover = (n.autorecover === undefined ) ? false : n.autorecover;
        if(isNaN(irq)) irq= -1 ; 
        node.nrf24_configuration= {
            PALevel: parseInt(n.palevel),       //PALEvel
            DataRate: parseInt(n.datarate),
            Channel: parseInt(n.channel),
            CRCLength: parseInt(n.crclength),
            retriesDelay: parseInt(n.retriesdelay),
            retriesCount: parseInt(n.retriescount),
            PayloadSize: parseInt(n.payloadsize),
            AddressWidth: 5,
            //TxDelay: 200,
            Irq: irq
        };

        // Conversion helpers
        node.convertToBuffer=function(d) {
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
            } catch(err) {
                node.warn("Unable to convert payload to buffer->" + err);
            }
            return null;

        };
        node.convertToString=function(d) {
            if(Buffer.isBuffer(d)) return d.toString(); // utf8
            if(typeof d === "string") return d;
            node.error("RF24 not valid buffer to string conversion");
            return "";
        };
        // Read helpers
        // --------------
        node.read_pipes=[null,null,null,null,null]; // 5 read pipes callbacks
        node.used_pipes=0; // counter of used pipes
        // readDispacher Initiatie the async read of registered pipes
        // and send to the registered callback for each
        node.readDispacher=function(){
            if(!node.radio_ok || node.is_locked()) return;
            var rid=RED.util.generateId();

            node.nRF24.read(function(arr,items) {
                for(var i=0;i<items;i++){
                    let pipe=arr[i].pipe-1;
                    if(node.read_pipes[pipe]!=null) {
                        let rxStat=node.nRF24.getStats(arr[i].pipe);
                        node.read_pipes[pipe](arr[i].data,rxStat);
                    }
                } // for
            },
            function(stop,by_user,err_count) {
                node.log("nRF24 listeing stop. rid= "+ rid +" stop="+stop+" , by_user=" + by_user +
                         ",error count="+ err_count);
            });
            node.log("nRF24 started listening in channel "+ node.nrf24_configuration.Channel + " rid:" + rid);
        };
        // deregisterReader remove a reader client
        node.deregisterReader=function(pipeID) {
            if(!node.radio_ok || node.is_locked() || pipeID < 1 || pipeID > 6
         || node.used_pipes[pipeID-1]==null) return;
            node.radio.removeReadPipe(pipeID);
            node.read_pipes[pipeID-1]=null;
            node.used_pipes--;
            node.log("Reading Pipe id:" + pipeID + " removed. Now listeing on #"+node.used_pipes+" pipes");
            if(node.read_pipes==0) {
                node.log("No reading pipes selected: The reader thread will stop.");
                node.nRF24.stopRead(); // Stop Reading
            }
        };

        node.on("close",function(removed,done){
            node.read_pipes=[null,null,null,null,null];
            node.used_pipes=0;
            if(node.radio_ok && !node.is_locked()) { // Clean & close
            
                for(var i=1;i<6;i++) node.nRF24.removeReadPipe(i);
                node.nRF24.stopRead();
                node.nRF24.stopWrite();
                node.nRF24.destroy(); // Free resources
                node.log("Closing radio removed:"+ removed);
            }
            done();
        });

        node.registerReader=function(addr,auto_ack,callback,max_merge) {
            if (!node.radio_ok || node.is_locked() || !(callback instanceof Function)) return -1;
            var pipe=node.nRF24.addReadPipe(addr,auto_ack);
            if(pipe==-1) return -1;
            if(max_merge !== undefined) node.nRF24.changeReadPipe(pipe,auto_ack,max_merge);
            node.nRF24.resetStats(pipe);  // Reset stats for this pipe.
            node.read_pipes[pipe-1]=callback;
            node.used_pipes=node.used_pipes+1;
            if(node.used_pipes ==1 ) node.readDispacher();
            node.log("nRF24 reading pipe registered for pipe address:"+ addr + " autoAck:" + auto_ack);
            return pipe;
        };

        // Writer helpers & Control variables
        node.last_write_addr=-1;
        node.last_write_ack=true;
        node.last_maxstream=512;
        node.write_queue=[];
        node.write_in_progress=false;
        node.write_sender=function() {
            if(node.write_queue.length ==0) {
                node.write_in_progress=false;
            } else {
                node.write_in_progress=true;
                var next=node.write_queue.pop();
                //console.log("Next write" + JSON.stringify(next));
                var maxs= (next.mode ==1 ) ? node.last_maxstream : next.maxstream;
                var callback_wrapper=function(success,tx_ok, tx_b,req) {
                    next.callback(success,tx_ok,tx_b,req);
                    //node.log("wrapper->"+success+ " " +tx_ok + " "+ tx_b+ " "+ req);
                    // Auto recover
                    if(!success) node.DetectFailure();
                    setTimeout(node.write_sender,0);
                };
                node.sw_write(next.addr,next.auto_ack,maxs);
                if(next.mode==1) node.nRF24.write(next.d,callback_wrapper);
                else node.nRF24.stream(next.d,callback_wrapper);
            }
        }
        node.DetectFailure=function() {
            if(node.nRF24.hasFailure()) {
                node.error("Radio Faliure detected");
                if(node.autorecover) {
                    node.log("Auto failure recovery attempt");
                    node.nRF24.restart();
                }
                node.write_queue = []; // Clean any pending read.
            }
        };
        // Switch write parameters
        node.sw_write=function(addr,auto_ack,maxstream) {
            if(node.last_write_addr == -1 || addr!=node.last_write_addr ||
               node.last_write_ack != auto_ack || node.last_maxstream != maxstream) {
                node.last_write_addr=addr;
                node.last_write_ack=auto_ack;
                node.last_maxstream=maxstream;
                node.nRF24.useWritePipe(addr);
                node.nRF24.changeWritePipe(auto_ack,maxstream);
            }
        }
        // Write Sync -> this will skip writing queue
        node.writeSync=function(data,addr,auto_ack) {
            if(!node.radio_ok || node.is_locked()) return false;
            var d=(Buffer.isBuffer(data)) ? data : Buffer.from(data);
            node.sw_write(addr,auto_ack,node.last_maxstream);
            let success=node.nRF24.write(d);
            if(!success) node.DetectFailure();
            return success;
        }

        node.write=function(mode,data,addr,auto_ack,callback,maxstream) {
            if(!node.radio_ok || node.is_locked()) return false;
            if(!(callback instanceof Function) ) return false;
            if(!(mode == 1 || mode == 2 )) return false; // check only async writes
            var d=(Buffer.isBuffer(data)) ? data : Buffer.from(data);
            //node.log(" Write request mode:" + mode + "data size:" + d.length );
            node.write_queue.unshift({mode:mode,d:d,addr:addr,auto_ack:auto_ack,callback:callback,maxstream:maxstream}); // Add to queue
            if(!node.write_in_progress) node.write_sender(); // Trigger send if no writing in progress
        };


        // Stats
        node.resetStats= function() {if(node.radio_ok && !node.is_locked()) node.nRF24.resetStats(); }
        node.stats= function() {if(node.radio_ok && !node.is_locked()) return node.nRF24.getStats(); else return undefined; }
        // failure handling
        node.hasFailure=function()  { return node.hasFailure(); }
        node.restart=function() { if(node.radio_ok && !node.is_locked()) node.nRF24.restart(); }
        // lock & unlock radio
        node.lock_use=function()   { node.used_by_stack=true;  }
        node.unlock_use=function() { node.used_by_stack=false; }
        node.is_locked=function() { return node.usded_by_stack; }
        node.use=function() { node.used++; }
        node.release=function() { node.used--; if(node.used<0) node.used=0; }
        node.is_used=function() { return node.used>0; }

        // Instanciate the radio
        node.radio_ok=false;
        try {
            node.nRF24=new nrf24_module.nRF24(node.ce,node.cs);
            node.radio_ok = node.nRF24.begin() && node.nRF24.present() && node.nRF24.powerUp();
            
            if(node.radio_ok) {
                // Send a dummmy payload to test failure
                node.nRF24.config({PALevel: nrf24_module.RF24_PA_MIN,
                                   DataRate:nrf24_module.RF24_1MBPS ,
                                   Channel: 10,
                                   CRCLength: parseInt(n.crclength),
                                   retriesDelay: 15,
                                   retriesCount: 5,
                                   PayloadSize: 32,
                                   AddressWidth: 5,
                                   Irq: -1
                                  });
                node.nRF24.useWritePipe("0x0A0B0C0D0E",true); // Dummy address
                node.nRF24.write(Buffer.from("dummy load"));
                node.radio_ok = !node.nRF24.hasFailure();          // if failure is detected a problem with wiring is detected
                if(node.radio_ok) { 
                    node.nRF24.config(node.nrf24_configuration);
                    node.Pvariant=node.nRF24.isP();
                    node.nRF24.resetStats();
                }
            }

            if(node.radio_ok) 
                node.log("Radio RF24 started OK:" + node.radio_ok + " is nrf24l01+:" + node.Pvariant);
            else
                node.log("Radio Failed to initialize, wiring or hardware problem. FailureDetected:" + node.nRF24.hasFailure());

        }catch(err) {
            node.error("Exception <Could not initialize RF24 radio> =>" + err);
        }

    }
    //Register the node
    RED.nodes.registerType("RF24radio",RF24radio);

};
