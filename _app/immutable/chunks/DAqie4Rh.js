const u="2026-09-22";function d(a){const[t,n,e]=u.split("-").map(Number),[o,r,s]=a.split("-").map(Number);return Math.round((Date.UTC(o,r-1,s)-Date.UTC(t,n-1,e))/864e5)+1}export{d};
