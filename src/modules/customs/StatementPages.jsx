import React, { useEffect, useState } from "react";
import { statementPdf } from "./statementPdf";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = worker;

export default function StatementPages({record,data,date,onReady}) {
  const [pages,setPages]=useState([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true, task;
    const controller=new AbortController();
    onReady(null); setPages([]); setError("");
    async function render(){
      const response=await fetch("/branding/formato-caratula-carta-eyr.png",{signal:controller.signal});
      if(!response.ok)throw new Error("No se pudo cargar el membrete.");
      const pdf=statementPdf(record,data,new Uint8Array(await response.arrayBuffer()),date);
      if(!active)return;
      task=pdfjs.getDocument({data:pdf.output("arraybuffer"),useSystemFonts:true});
      const documentPdf=await task.promise;
      const images=[];
      for(let n=1;n<=documentPdf.numPages && active;n++){
        const page=await documentPdf.getPage(n);
        const viewport=page.getViewport({scale:2});
        const canvas=document.createElement("canvas");canvas.width=viewport.width;canvas.height=viewport.height;
        await page.render({canvas,viewport}).promise;
        images.push(canvas.toDataURL("image/jpeg",.95));canvas.width=0;canvas.height=0;page.cleanup();
      }
      if(active){setPages(images);onReady({pdf,images});}
    }
    render().catch(e=>{if(active)setError(e.message);}).finally(()=>task?.destroy());
    return ()=>{active=false;controller.abort();};
  },[record,data,date,onReady]);
  if(error)return <p role="alert">{error}</p>;
  return <div className="ce-pages">{pages.length ? pages.map((src,i)=><img key={i} src={src} alt={"Estado de cuenta "+record.case_code+", página "+(i+1)}/>) : <p>Preparando estado de cuenta…</p>}</div>;
}
