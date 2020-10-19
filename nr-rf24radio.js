"use strict";

module.exports = function(RED) {

    const nrf24_module=require("nrf24");
    const nrutil=require("./nr-util.js");

    function RF24radio(n) {

        RED.nodes.createNode(this,n);
        var node = this;

        // Apply configurations
        node.used_by_stack=false;
        node.used=0;
        node.ce = parseInt(n.ce);
        node.cs = parseInt(n.cs);
        node.spispeed= parseInt(n.spispeed);
        var txDelay= parseInt(n.txdelay);
        //node.nrf24_module=nrf24_module;
        var irq= (n.irq === undefined) ? -1 : parseInt(n.irq);
        node.autorecover = (n.autorecover === undefined ) ? false : n.autorecover;
        if(isNaN(irq)) irq= -1 ;
        if(isNaN(node.spispeed)) node.spispeed=10000000; // 10Mhz default
        if(isNaN(txDelay)) txDelay=250; // 250 us before switch to TX model
        // Config object
        node.nrf24_configuration= {
            PALevel: parseInt(n.palevel),       //PALEvel
            EnableLna: (n.enablelna === undefined) ? false : n.enablelna,
            DataRate: parseInt(n.datarate),
            Channel: parseInt(n.channel),
            CRCLength: parseInt(n.crclength),
            retriesDelay: parseInt(n.retriesdelay),
            retriesCount: parseInt(n.retriescount),
            PayloadSize: parseInt(n.payloadsize),
            AddressWidth: 5,
            TxDelay: txDelay,
            Irq: irq
        };
        // Helper constants
        node.WRITE_SYNC=0;
        node.WRITE_ASYNC=1;
        node.WRITE_STREAM=2;


        // --------------
        // Read helpers
        // --------------
        node.read_pipes=[null,null,null,null,null]; // 5 read pipes callbacks pipe 1 to 6.
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
                        //console.log("rcv ->" + Date.now());
                    }
                } // for
            },
            function(stop,by_user,err_count) {
                node.log("nRF24 listeing stop. rid= "+ rid +" stop="+stop+" , by_user=" + by_user +
                         ",error count="+ err_count);
            });
            node.log("nRF24 started listening in channel "+ node.nrf24_configuration.Channel + " rid:" + rid);
        };
        // deregisterReader remove a reader client, pipe ID is the pipe Nr returned by registerReader.
        node.deregisterReader=function(pipeID) {
            if(!node.radio_ok || node.is_locked() || pipeID < 1 || pipeID > 6
         || node.used_pipes[pipeID-1]==null) return;
            node.radio.removeReadPipe(pipeID);
            node.read_pipes[pipeID-1]=null;
            node.used_pipes--;
            node.log("Reading Pipe id:" + pipeID + " removed. Now listeing on #"+node.used_pipes+" pipes");
            if(node.read_pipes==0) { // Stip the reader if no need to listen
                node.log("No reading pipes selected: The reader thread will stop.");
                node.nRF24.stopRead(); // Stop Reading
            }
        };
        // Register a reader node
        // addr: pipe adderss, auto_ack: enable auto ack , max_merge: maximun number of frames to merge
        // callback is function with the signature
        // Ret
        node.registerReader=function(addr,auto_ack,callback,max_merge) {
            if (!node.radio_ok || node.is_locked() || !(callback instanceof Function)) return -1;
            var pipe=node.nRF24.addReadPipe(addr,auto_ack);
            if(pipe==-1) return -1;
            if(max_merge !== undefined) node.nRF24.changeReadPipe(pipe,auto_ack,max_merge);
            node.nRF24.resetStats(pipe);  // Reset stats for this pipe.
            node.read_pipes[pipe-1]=callback;
            node.used_pipes=node.used_pipes+1;
            if(node.used_pipes ==1 ) node.readDispacher(); // Start the dispatches on first register.
            node.log("nRF24 reading pipe registered for pipe address:"+ addr + " autoAck:" + auto_ack);
            return pipe;
        };

        node.on("close",function(removed,done){
            node.read_pipes=[null,null,null,null,null]; // Pipe 1,2,3,4,5
            node.used_pipes=0;
            if(node.radio_ok && !node.is_locked()) { // Clean & close
                node.nRF24.stopRead();
                for(var i=1;i<6;i++) node.nRF24.removeReadPipe(i);
                node.nRF24.stopWrite();
                node.nRF24.destroy(); // Free resources
            }
            node.log("Closing radio removed:"+ removed);
            done();
        });

        // -------------------------
        // Writer helpers
        // -------------------------
        var last_write_addr=-1;
        var last_write_ack=true;
        var last_write_maxstream=512;
        const change_write_config= (addr,auto_ack,maxstream) => {
            if(last_write_addr == -1 || addr!=last_write_addr ||
               last_write_ack != auto_ack || last_write_maxstream != maxstream) {
                last_write_addr=addr;
                last_write_ack=auto_ack;
                last_write_maxstream=maxstream;
                node.nRF24.useWritePipe(addr);
                node.nRF24.changeWritePipe(auto_ack,maxstream);
            }
        };
        const manage_failure = () => {
            if(node.nRF24.hasFailure()) {
                node.warn("Radio failure detected");
                if(node.autorecover) node.restart();
            }
        };

        node.write = (mode,data,addr,auto_ack,max_stream) => { 
            return new Promise((resolve,reject) => {
                   if(!node.radio_ok || node.is_locked()) { 
                       reject("can't write, radio is not available or in use");
                   } else {
                      let d=(Buffer.isBuffer(data)) ? data : Buffer.form(data);
                      change_write_config(addr,auto_ack,max_stream);
                      //console.log("snd ->" + Date.now());
                      switch(mode) {
                          case node.WRITE_SYNC:
                            let res=node.nRF24.write(d);
                            let tx_b= (res) ? 1 : 0;
                            resolve({success: res, tx_ok: tx_ok, tx_b: tx_b*node.nrf24_configuration.payloadsize,req:1 });
                            manage_failure();
                            break;
                          case node.WRITE_STREAM:
                                node.nRF24.stream(d, (success,tx_ok,tx_b,req) => { 
                                  resolve({success:success,tx_ok:tx_ok,tx_b:tx_b,req:req});
                                  manage_failure();  
                                });
                                break;
                          default:
                                node.nRF24.write(d, (success,tx_ok,tx_b,req) => { 
                                    resolve({success:success,tx_ok:tx_ok,tx_b:tx_b,req:req});
                                    manage_failure();  
                                });
                      }
        
                    }
            }); 
        };
        
        //------------------
        // Writer helpers & write Control variables
        //------------------
        //node.last_write_addr=-1;  // Last pipe address to write 
        //node.last_write_ack=true; // Last 
        //node.last_maxstream=512;
        //node.write_queue=[];
        //node.write_in_progress=false;
        //node.write_sender=function() {
        //    if(node.write_queue.length ==0) {
        //        node.write_in_progress=false;
        //    } else {
        //        node.write_in_progress=true;
        //        var next=node.write_queue.pop();
        //        //console.log("Next write" + JSON.stringify(next));
        //        var maxs= (next.mode ==1 ) ? node.last_maxstream : next.maxstream;
        //        var callback_wrapper=function(success,tx_ok, tx_b,req) {
        //            next.callback(success,tx_ok,tx_b,req);
        //            //node.log("wrapper->"+success+ " " +tx_ok + " "+ tx_b+ " "+ req);
        //            // Auto recover
        //            if(!success) node.DetectFailure();
        //            setTimeout(node.write_sender,0);
        //        };
        //        node.sw_write(next.addr,next.auto_ack,maxs);
        //        if(next.mode==1) node.nRF24.write(next.d,callback_wrapper);
        //        else node.nRF24.stream(next.d,callback_wrapper);
        //    }
        //}
        //node.DetectFailure=function() {
        //    if(node.nRF24.hasFailure()) {
        //        node.warn()("Radio Faliure detected");
        //        if(node.autorecover) {
        //            node.log("Auto failure recovery initiated");
        //            node.nRF24.restart();
        //        }
        //        node.write_queue = []; // Clean any pending write
        //    }
        //};
        //// Switch write parameters
        //node.sw_write=function(addr,auto_ack,maxstream) {
        //    if(node.last_write_addr == -1 || addr!=node.last_write_addr ||
        //       node.last_write_ack != auto_ack || node.last_maxstream != maxstream) {
        //        node.last_write_addr=addr;
        //        node.last_write_ack=auto_ack;
        //        node.last_maxstream=maxstream;
        //        node.nRF24.useWritePipe(addr);
        //        node.nRF24.changeWritePipe(auto_ack,maxstream);
        //    }
        //}
        //// Write Sync -> this will skip writing queue
        //node.writeSync=function(data,addr,auto_ack) {
        //    if(!node.radio_ok || node.is_locked()) return false;
        //    var d=(Buffer.isBuffer(data)) ? data : Buffer.from(data);
        //    node.sw_write(addr,auto_ack,node.last_maxstream);
        //    let success=node.nRF24.write(d);
        //    if(!success) node.DetectFailure();
        //    return success;
        //}
//
        //node.write=function(mode,data,addr,auto_ack,callback,maxstream) {
        //    if(!node.radio_ok || node.is_locked()) return false;
        //    if(!(callback instanceof Function) ) return false;
        //    if(!(mode == 1 || mode == 2 )) return false; // check only async writes
        //    var d=(Buffer.isBuffer(data)) ? data : Buffer.from(data);
        //    //node.log(" Write request mode:" + mode + "data size:" + d.length );
        //    node.write_queue.unshift({mode:mode,d:d,addr:addr,auto_ack:auto_ack,callback:callback,maxstream:maxstream}); // Add to queue
        //    if(!node.write_in_progress) node.write_sender(); // Trigger send if no writing in progress
        //};


        // Stats
        node.resetStats= function() {if(node.radio_ok && !node.is_locked()) node.nRF24.resetStats(); }
        node.stats= function() {if(node.radio_ok && !node.is_locked()) return node.nRF24.getStats(); else return undefined; }
        // failure handling
        node.hasFailure=function()  { return node.hasFailure(); }
        node.restart=function() { if(node.radio_ok && !node.is_locked()) node.nRF24.restart(); }
        // lock & unlock radio
        node.lock_use=function()   { node.used_by_stack=true;  }
        node.unlock_use=function() { node.used_by_stack=false; }
        node.is_locked=function() { return node.used_by_stack; }
        node.use=function() { node.used++; }
        node.release=function() { node.used--; if(node.used<0) node.used=0; }
        node.is_used=function() { return node.used>0; }

        // Instanciate the radio
        node.radio_ok=false;
        try {
            node.nRF24=new nrf24_module.nRF24(node.ce,node.cs,node.spispeed);
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
    RED.httpAdmin.get("/nrf24-boards", RED.auth.needsPermission('debug.read'), function(req,res) {
       nrutil.loadProfiles().then((v) => res.json(v));//.catch(() => res.status(404).end() );
    });

};
