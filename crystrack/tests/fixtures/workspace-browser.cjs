const path = require('node:path');
const esbuild = require('esbuild'),
  root = path.resolve(__dirname, '../..');
module.exports = async function buildWorkspaceFixture(directory) {
  const pages = {
    '/': 'page',
    '/plan': 'plan/page',
    '/tasks': 'tasks/page',
    '/goals': 'goals/page',
    '/assignments': 'assignments/page',
    '/calendar': 'calendar/page',
    '/finance': 'finance/page',
    '/insights': 'insights/page',
    '/history': 'history/page',
    '/ai': 'ai/page',
    '/settings': 'settings/page',
    '/auth': 'auth/page',
  };
  const imports = Object.entries(pages)
    .map(
      ([path, file], i) =>
        `import Page${i} from '${root}/src/app/${file}.tsx';`,
    )
    .join('');
  return esbuild.build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AppLayout} from '${root}/src/components/layout/app-layout.tsx';import {FixtureThemeProvider} from 'fixture-theme';${imports}const pages={${Object.keys(
        pages,
      )
        .map((p, i) => JSON.stringify(p) + ':Page' + i)
        .join(
          ',',
        )}};const Page=pages[location.pathname]||pages['/'];createRoot(document.getElementById('root')).render(<FixtureThemeProvider><AppLayout><Page/></AppLayout></FixtureThemeProvider>);`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    outfile: path.join(directory, 'app.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': root + '/src' },
    plugins: [
      {
        name: 'fixture',
        setup(build) {
          for (const [filter, path] of [
            [/next\/navigation$/, 'nav'],
            [/next\/link$/, 'link'],
            [/next\/image$/, 'image'],
            [/theme-provider$/, 'theme'],
            [/^fixture-theme$/, 'theme'],
            [/auth-provider$/, 'auth'],
            [/lib\/supabase\/client$/, 'supabase'],
          ])
            build.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
          build.onLoad(
            { filter: /.*/, namespace: 'fixture' },
            ({ path: p }) => ({
              contents:
                p === 'theme'
                  ? `import React from 'react';import {workspaceThemeTokens,getThemeForPhase} from '${root}/src/lib/theme.ts';import {effectiveWorkspaceTheme} from '${root}/src/lib/workspace/design.ts';const Context=React.createContext(null);export function FixtureThemeProvider({children}){const [preference,setPreferenceState]=React.useState(localStorage.getItem('fixture-theme')||'dark'),[reducedMotion,setReducedMotion]=React.useState(false);const environment=window.__environment;React.useLayoutEffect(()=>{const mode=effectiveWorkspaceTheme(preference,environment.phase);document.documentElement.dataset.workspaceTheme=mode;document.documentElement.dataset.crysReducedMotion=reducedMotion?'true':'false';for(const [key,value]of Object.entries(workspaceThemeTokens(mode)))document.documentElement.style.setProperty(key,value);},[preference,reducedMotion]);return <Context.Provider value={{theme:getThemeForPhase(environment.phase,preference),environment,preference,setPreference:async p=>{localStorage.setItem('fixture-theme',p);setPreferenceState(p);},reducedMotion,setReducedMotion,requestLocation:async()=>{},environmentLoading:false,locationPermission:'denied',refreshEnvironment:async()=>{}}}>{children}</Context.Provider>;}export const useTheme=()=>React.useContext(Context);`
                  : p === 'auth'
                    ? `export const useAuth=()=>({user:{id:'00000000-0000-4000-8000-000000000001',email:'test@example.test',user_metadata:{full_name:'Emmanuel'}},loading:false,refreshUser:async()=>null,signOut:async()=>{location.assign('/auth')}});`
                    : p === 'supabase'
                      ? `export const createClient=()=>({auth:{signInWithPassword:async()=>({error:null}),signUp:async()=>({error:null})}});`
                      : p === 'link'
                        ? `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}`
                        : p === 'image'
                          ? `import React from 'react';export default function Image({unoptimized,fetchPriority,...props}){return <img {...props} fetchPriority={fetchPriority}/>;}`
                          : `import React from 'react';export const usePathname=()=>location.pathname;export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(location.search),[]);export const useRouter=()=>({push:p=>location.assign(p),replace:p=>location.replace(p),refresh:()=>{}});`,
              loader: 'tsx',
              resolveDir: root,
            }),
          );
        },
      },
    ],
  });
};
