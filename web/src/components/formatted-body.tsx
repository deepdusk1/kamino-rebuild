import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function Spoiler({text}:{text:string}){const [open,setOpen]=useState(false);return <button type="button" aria-label={open?"Hide spoiler":"Reveal spoiler"} className="k-focus inline rounded px-1" onClick={()=>setOpen(!open)} style={{background:open?"transparent":"currentColor"}}><span style={{visibility:open?"visible":"hidden"}}>{text}</span></button>;}

// A small, deliberately limited formatting vocabulary. React escapes all text;
// raw HTML and executable URL schemes never become markup.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\|\|[^|\n]+\|\||\*\*[^*\n]+\*\*|_[^_\n]+_|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, i) => {
      if(part.startsWith("||")&&part.endsWith("||"))return <Spoiler key={i} text={part.slice(2,-2)}/>;
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={i} className="font-extrabold text-ink">
            {part.slice(2, -2)}
          </strong>
        );
      if (part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith("~~") && part.endsWith("~~")) return <s key={i}>{part.slice(2, -2)}</s>;
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link)
        return (
          <a
            key={i}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-violet underline decoration-2 underline-offset-2"
          >
            {link[1]}
          </a>
        );
      return part;
    });
}

/**
 * The text of a post. Plain text keeps its line breaks; `formatted` (markdown-lite) supports headings (# / ##),
 * quotes (>), bullet lines (-), **bold**, _italic_, ~~strike~~ and [links](https://…).
 * Sized like the mockup's post text (13.5px on phones, 16px on computers).
 */
export function FormattedBody({
  body,
  formatted = false,
  className,
}: {
  body: string;
  formatted?: boolean;
  className?: string;
}) {
  const base = "break-words text-[13.5px] leading-5 text-body lg:text-[16px] lg:leading-[25px]";
  if (!formatted) return <p className={cn(base, "whitespace-pre-wrap", className)}>{body.split(/(\|\|[^|\n]+\|\|)/g).map((p,i)=>p.startsWith("||")&&p.endsWith("||")?<Spoiler key={i} text={p.slice(2,-2)}/>:p)}</p>;
  return (
    <div className={cn(base, "space-y-2", className)}>
      {body.split("\n").map((line, i) => {
        const image=/^!\[([^\]]*)\]\((\/api\/v1\/content-media\/\d+)\)$/.exec(line);
        if(image)return <img key={i} src={image[2]} alt={image[1]||"Article image"} loading="lazy" className="max-h-[500px] w-full rounded-card object-contain"/>;
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="pt-2 text-[17px] leading-6 font-extrabold text-ink lg:text-[20px]">
              {inline(line.slice(3))}
            </h3>
          );
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="pt-2 text-[20px] leading-7 font-extrabold tracking-[-0.01em] text-ink lg:text-[24px]">
              {inline(line.slice(2))}
            </h2>
          );
        if (line.startsWith("> "))
          return (
            <blockquote key={i} className="rounded-r-tile border-l-[3px] border-violet bg-tint-violet/60 py-1.5 pr-2 pl-3 text-muted">
              {inline(line.slice(2))}
            </blockquote>
          );
        if (line.startsWith("- "))
          return (
            <ul key={i} className="list-disc pl-5 marker:text-violet">
              <li>{inline(line.slice(2))}</li>
            </ul>
          );
        return (
          <p key={i} className="min-h-3 whitespace-pre-wrap">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}
