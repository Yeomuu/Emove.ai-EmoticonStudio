import { lazy, Suspense } from "preact/compat";
import { useEffect } from "preact/hooks";
import { Shell } from "./components/Shell";
import { HomePage } from "./pages/Home";
import { route } from "./router";
import { loadCharacters } from "./services/repository";
import { characters } from "./store";

const CharacterPage = lazy(() => import("./pages/Character").then((module) => ({ default: module.CharacterPage })));
const InputPage = lazy(() => import("./pages/Input").then((module) => ({ default: module.InputPage })));
const EditPage = lazy(() => import("./pages/Edit").then((module) => ({ default: module.EditPage })));
const LibraryPage = lazy(() => import("./pages/Library").then((module) => ({ default: module.LibraryPage })));

export function App() {
  useEffect(() => {
    loadCharacters().then((saved) => {
      const known = new Set(characters.value.map((item) => item.id));
      characters.value = [...saved.filter((item) => !known.has(item.id)), ...characters.value];
    }).catch(() => undefined);
  }, []);

  const path = route.value;
  let page = <HomePage />;
  if (path === "/character") page = <CharacterPage />;
  else if (path === "/input") page = <InputPage />;
  else if (path === "/edit") page = <EditPage />;
  else if (path.startsWith("/library")) page = <LibraryPage />;
  return (
    <Shell immersive={path === "/home"}>
      <Suspense fallback={<div class="route-loader" role="status"><span />화면을 불러오는 중</div>}>{page}</Suspense>
    </Shell>
  );
}
