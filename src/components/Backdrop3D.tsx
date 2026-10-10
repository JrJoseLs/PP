/* Fondo 3D sutil: una "telaraña" de competencias que respira, con partículas
   en profundidad. Se carga aparte (lazy) para no pesar en el resto de la app. */
import { useEffect, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial, Scene, Vector3, WebGLRenderer, type Material } from "three";

export default function Backdrop3D() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let renderer: WebGLRenderer;
    try { renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { return; }   // sin WebGL: el fondo degradado CSS basta
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    el.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 9.5);

    const css = getComputedStyle(document.documentElement);
    const accent = new Color(css.getPropertyValue("--accent").trim() || "#0a84ff");
    const accent2 = new Color(css.getPropertyValue("--accent-2").trim() || "#bf5af2");
    const ink = new Color(css.getPropertyValue("--text-3").trim() || "#86868b");

    const N = 24, R = 3.4;
    const web = new Group();
    web.rotation.x = -0.95;
    scene.add(web);

    const lineMat = new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.22 });
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const pts = Array.from({ length: N + 1 }, (_, i) => { const a = (i / N) * Math.PI * 2; return new Vector3(Math.cos(a) * R * f, Math.sin(a) * R * f, 0); });
      web.add(new Line(new BufferGeometry().setFromPoints(pts), lineMat));
    }
    const spokes: Vector3[] = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; spokes.push(new Vector3(0, 0, 0), new Vector3(Math.cos(a) * R, Math.sin(a) * R, 0)); }
    web.add(new LineSegments(new BufferGeometry().setFromPoints(spokes), lineMat));

    // dos "perfiles" que respiran: polígono relleno + contorno
    const mkShape = (color: Color, opacity: number, z: number) => {
      const geo = new BufferGeometry();
      const pos = new Float32Array((N + 1) * 3);
      geo.setAttribute("position", new BufferAttribute(pos, 3));
      const idx: number[] = []; for (let i = 1; i <= N; i++) idx.push(0, i, i === N ? 1 : i + 1);
      geo.setIndex(idx);
      const fill = new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthWrite: false }));
      const lgeo = new BufferGeometry(); const lpos = new Float32Array((N + 1) * 3);
      lgeo.setAttribute("position", new BufferAttribute(lpos, 3));
      const line = new Line(lgeo, new LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      fill.position.z = line.position.z = z;
      web.add(fill, line);
      return { pos, lpos, geo, lgeo, mats: [fill.material as MeshBasicMaterial, line.material as LineBasicMaterial] };
    };
    const shapes = [mkShape(accent, 0.13, 0.02), mkShape(accent2, 0.09, 0.04)];
    const seeds = shapes.map((_, s) => Array.from({ length: N }, (_, i) => 0.45 + 0.35 * Math.abs(Math.sin(i * 1.7 + s * 2.3))));

    // partículas
    const P = 420, ppos = new Float32Array(P * 3);
    for (let i = 0; i < P; i++) { ppos[i * 3] = (Math.random() - 0.5) * 22; ppos[i * 3 + 1] = (Math.random() - 0.5) * 14; ppos[i * 3 + 2] = -Math.random() * 14 + 2; }
    const pgeo = new BufferGeometry(); pgeo.setAttribute("position", new BufferAttribute(ppos, 3));
    const points = new Points(pgeo, new PointsMaterial({ color: accent, size: 0.035, transparent: true, opacity: 0.55, sizeAttenuation: true }));
    scene.add(points);

    // Los colores salen del tema (claro u oscuro): se vuelven a leer cuando el tema cambia
    const themed: [{ color: Color }, string][] = [
      [lineMat, "--text-3"], [shapes[0].mats[0], "--accent"], [shapes[0].mats[1], "--accent"],
      [shapes[1].mats[0], "--accent-2"], [shapes[1].mats[1], "--accent-2"], [points.material as PointsMaterial, "--accent"],
    ];
    const recolor = () => {
      const cs = getComputedStyle(document.documentElement);
      themed.forEach(([m, v]) => { const c = cs.getPropertyValue(v).trim(); if (c) m.color.set(c); });
      if (reduce) renderer.render(scene, camera);
    };
    const themeObs = new MutationObserver(recolor);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      web.position.x = w > 900 ? 2.6 : 0; web.position.y = w > 900 ? 0 : 1.8;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    let mx = 0, my = 0;
    const onMove = (e: PointerEvent) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener("pointermove", onMove);

    let raf = 0, running = true;
    const frame = (t: number) => {
      const s = t / 1000;
      shapes.forEach((sh, k) => {
        for (let i = 0; i <= N; i++) {
          const j = i % N, a = (j / N) * Math.PI * 2;
          const r = R * Math.min(0.98, seeds[k][j] + 0.08 * Math.sin(s * 0.7 + j * 0.9 + k * 1.3));
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i < N) { sh.pos[(i + 1) * 3] = x; sh.pos[(i + 1) * 3 + 1] = y; }
          sh.lpos[i * 3] = x; sh.lpos[i * 3 + 1] = y;
        }
        sh.geo.attributes.position.needsUpdate = true; sh.lgeo.attributes.position.needsUpdate = true;
      });
      web.rotation.z = s * 0.05;
      web.rotation.y += ((mx * 0.35) - web.rotation.y) * 0.04;
      web.rotation.x += ((-0.95 + my * 0.25) - web.rotation.x) * 0.04;
      points.rotation.y = s * 0.012; points.position.y = Math.sin(s * 0.2) * 0.15;
      renderer.render(scene, camera);
      if (running && !reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); running = !document.hidden; if (running && !reduce) raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", vis);

    return () => {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); themeObs.disconnect();
      window.removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", vis);
      scene.traverse((o) => { const m = o as Mesh; m.geometry?.dispose(); (m.material as Material | undefined)?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <div className="backdrop3d" ref={host} aria-hidden="true" />;
}
