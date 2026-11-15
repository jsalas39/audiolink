class Cap extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(2048);this.i=0}
 process(inp){const x=inp[0][0];if(x)for(let k=0;k<x.length;k++){this.b[this.i++]=x[k];if(this.i===2048){this.port.postMessage(this.b.slice());this.i=0}}return true}}
registerProcessor('cap',Cap);
