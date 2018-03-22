'use strict';

module.exports = function(RED) {

  const nrf24_module=require('nrf24');
  //var nrf24_module=require('/home/boros/.node-red/node_modules/node-rf24');

  function RF24radio(n) {
    RED.nodes.createNode(this,n);
    var node = this;

    // Apply configurations
    node.used_by_stack=false;
    node.used=0;
    node.ce = parseInt(n.ce);
    node.cs = parseInt(n.cs);
    node.nrf24_module=nrf24_module;
    node.nrf24_configuration= {
      PALevel: parseInt(n.palevel),       //PALEvel
      DataRate: parseInt(n.datarate),
      Channel: parseInt(n.channel),
      CRCLength: parseInt(n.crclength),
      retriesDelay: parseInt(n.retriesdelay),
      retriesCount: parseInt(n.retriescount),
      PayloadSize: parseInt(n.payloadsize),
      AddressWidth: 5
    };


    // Conversion helpers
    node.convertToBuffer=function(d) {
      if(Buffer.isBuffer(d)) return d; // if is a buffer nothing to do
      if(typeof d === 'string') return Buffer.from(d);     // string -> Buffer in utf8
      if(d instanceof ArrayBuffer ) return Buffer.from(d); // ArrayBuffer -> Buffer
      // Fallback assuming boolean
      var b=Buffer.alloc(1);
      b.WriteUInt8( (d) ? 1 : 0);
      if(!(typeof d === 'boolean')) node.error("RF24 not valid data to be transmited");
      return b;
    };
    node.convertToString=function(d) {
      if(Buffer.isBuffer(d)) return d.toString(); // utf8
      if(typeof d === 'string') return d;
      node.error("RF24 not valid buffer to string conversion");
      return "";
    }
    // Read helpers
    // --------------
    node.read_pipes=[null,null,null,null,null]; // 5 read pipes callbacks
    node.used_pipes=0; // counter of used pipes
    // readDispacher Initiatie the async read of registered pipes
    // and send to the registered callback for each
    node.readDispacher=function(){
      if(!node.radio_ok || node.is_locked()) return;
      var rid=RED.util.generateId();
      node.nRF24.read(function(data,pipe) {
          if(node.read_pipes[pipe-1]!=null) node.read_pipes[pipe-1](data);
      },
      function(stop,by_user,err_count) {
        node.log("nRF24 listeing stop. rid= "+ rid +" stop="+stop+" , by_user=" + by_user +",error count="+ err_count);
      });
      node.log("nRF24 started listening in channel "+ node.nrf24_configuration.Channel + " rid:" + rid);
    };
    // deregisterReader remove a reader client
    node.deregisterReader=function(pipeID) {
      if(!node.radio_ok || node.used_by_stack || pipeID < 1 || pipeID > 6
         || node.used_pipes[pipeID-1]==null) return;
      node.radio.removeReadPipe(pipeID);
      node.read_pipes[pipeID-1]=null;
      node.read_pipes--;
      if(node.read_pipes==0) node.nRF24.stop_read(); // Stop Reading
    }

    node.on('close',function(removed,done){
      node.read_pipes=[null,null,null,null,null];
      node.used_pipes=0;
      if(node.radio_ok && !node.used_by_stack) { // Clean & close
        for(var i=1;i<6;i++) node.nRF24.removeReadPipe(i);
        node.nRF24.stop_read();
      }
      done();
    });

    node.registerReader=function(addr,auto_ack,callback) {
      if (!node.radio_ok || !(callback instanceof Function)) return -1;
      var pipe=node.nRF24.addReadPipe(addr,auto_ack);
      if(pipe==-1) return -1;
      node.read_pipes[pipe-1]=callback;
      node.used_pipes=node.used_pipes+1;
      if(node.used_pipes ==1 ) node.readDispacher();
      node.log("nRF24 reading pipe registered for pipe address:"+ addr + " autoAck:" + auto_ack);
      return pipe;
    };

    // Write helper
    node.last_write_addr=-1;
    node.write=function(data,addr) {
      if(!node.radio_ok || node.used_by_stack) return false;
      var d=(Buffer.isBuffer(data)) ? data : Buffer.from(data);
      if(node.last_write_addr == -1 || addr!=node.last_write_addr)
        if(!node.nRF24.useWritePipe(addr)) return false;
      return node.nRF24.write(data);
    };

    // lock & unlock radio
    node.lock_use=function()   { node.used_by_stack=true;  }
    node.unlock_use=function() { node.used_by_stack=false; }
    node.is_locked=function() { return node.usded_by_stack; }
    node.use=function() { node.used++; }
    node.release=function() { node.used--; if(node.used<0) node.used=0; }
    node.is_used=function() { return node.used>0;}

    // Instanciate the radio
    node.radio_ok=false;
    try {
      node.nRF24=new nrf24_module.nRF24(node.ce,node.cs);
      node.radio_ok = node.nRF24.begin() && node.nRF24.present() && node.nRF24.powerUp();
      node.nRF24.config(node.nrf24_configuration);
      node.Pvariant=node.nRF24.isP();
      node.log("Radio RF24 started OK:" + node.radio_ok + " is nrf24l01+:" + node.Pvariant);
    }catch(err) {
      node.error("Could not initialize RF24 radio ->" + err);
    }

  }
  RED.nodes.registerType("RF24radio",RF24radio);

};
