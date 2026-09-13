const fs = require("fs");
const file = "src/app/components/CommentThread.tsx";
let source = fs.readFileSync(file, "utf8");
source = source.replace('[draft,setDraft]=useState("")', '[draft,setDraft]=useState(""),[hiddenReplies,setHiddenReplies]=useState<Record<string,boolean>>({})');
source = source.replace('const flatten=(comment:ThreadComment):ThreadComment[]=>[comment,...tree.children(comment.id).flatMap(flatten)];', 'const flatten=(comment:ThreadComment):ThreadComment[]=>[comment,...(hiddenReplies[comment.id]?[]:tree.children(comment.id).flatMap(flatten))];');
source = source.replace('</div>{editing===c.id?', '</div>{tree.children(c.id).length>0&&<button className="replyToggle" onClick={()=>setHiddenReplies(current=>({...current,[c.id]:!current[c.id]}))}>{hiddenReplies[c.id]?`Show replies (${tree.children(c.id).length})`:"Hide replies"}</button>}{editing===c.id?');
fs.writeFileSync(file, source);
