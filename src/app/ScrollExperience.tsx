"use client";

import { useEffect } from "react";

export default function ScrollExperience() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(pointer: fine)").matches;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    sections.forEach((section) => section.classList.add("motion-section"));

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      }),
      { threshold: 0.16, rootMargin: "0px 0px -8%" },
    );
    sections.forEach((section) => observer.observe(section));

    let frame = 0;
    const updateScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      root.style.setProperty("--scroll-progress", `${max > 0 ? scrollY / max : 0}`);
      root.style.setProperty("--page-scroll", `${scrollY}px`);
      frame = 0;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateScroll); };
    const onPointer = (event: PointerEvent) => {
      root.style.setProperty("--pointer-x", `${event.clientX / innerWidth - 0.5}`);
      root.style.setProperty("--pointer-y", `${event.clientY / innerHeight - 0.5}`);
    };
    updateScroll();
    addEventListener("scroll", onScroll, { passive: true });
    if (finePointer && !reduceMotion) addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      if (finePointer && !reduceMotion) removeEventListener("pointermove", onPointer);
    };
  }, []);
  return <div className="scroll-progress" aria-hidden="true" />;
}
