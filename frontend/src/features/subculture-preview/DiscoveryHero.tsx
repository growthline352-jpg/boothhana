/** Original fixture portraits: character identity stays distinct from product photography. */
export function CharacterPortrait({ id }: { id: string }) {
  return <svg className={`sc-character-portrait sc-portrait-${id}`} viewBox="0 0 240 240" aria-hidden="true">
    <rect width="240" height="240" rx="24" fill={id === 'luna' ? '#f6e8dd' : id === 'momo' ? '#dfeee5' : '#e4e9f7'}/>
    <circle cx="120" cy="125" r="84" fill="#ffffff" opacity=".35"/>
    <path d="m37 65 3-9 3 9 9 3-9 3-3 9-3-9-9-3Zm155 106 3-7 3 7 7 3-7 3-3 7-3-7-7-3Z" fill={id === 'luna' ? '#c89168' : id === 'momo' ? '#75a98f' : '#8e9eca'}/>
    {id === 'luna' ? <g stroke="#7e6054" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="120" cy="198" rx="61" ry="9" fill="#d9b7a0" opacity=".3" stroke="none"/>
      <path d="M153 55a28 28 0 0 0 36 33 30 30 0 1 1-36-33" fill="#e4b962" stroke="none"/>
      <ellipse cx="120" cy="163" rx="40" ry="35" fill="#fffaf1"/>
      <ellipse cx="96" cy="81" rx="16" ry="39" transform="rotate(-14 96 81)" fill="#fffaf1"/>
      <ellipse cx="135" cy="76" rx="16" ry="40" transform="rotate(12 135 76)" fill="#fffaf1"/>
      <path d="m94 59 5 36m38-43-5 40" stroke="#edc4b5" strokeWidth="9"/>
      <ellipse cx="118" cy="125" rx="50" ry="39" fill="#fffaf1"/>
      <path d="M102 122v5m32-5v5m-21 11q5 7 10 0"/>
      <ellipse cx="91" cy="137" rx="9" ry="5" fill="#e9b8a7" stroke="none"/><ellipse cx="145" cy="137" rx="9" ry="5" fill="#e9b8a7" stroke="none"/>
      <path d="m102 168 13 5 16-6 9 21-29 8Z" fill="#d6a36b"/><path d="m108 171 16 9 12-9"/>
    </g> : id === 'momo' ? <g stroke="#3d6555" strokeWidth="4" strokeLinejoin="round">
      <path d="M64 191h110v10H64z" fill="#accbb8" stroke="none"/>
      <path d="M89 147v38h61v-41m-2 28h21v-20h17v32h-37" fill="#8dbb9d"/>
      <path d="M67 76V48h29v17h49V48h30v86h-15v20H82v-20H67Z" fill="#f7f8dc"/>
      <path d="M75 58h13v19H75zm78 0h13v19h-13" fill="#ccaa99" stroke="none"/>
      <path d="M94 107h7v10h-7zm47 0h7v10h-7z" fill="#3d6555" stroke="none"/>
      <path d="M113 129h15m-8-7v7" strokeWidth="3"/><path d="M80 126h13m54 0h13" stroke="#e2b4a3" strokeWidth="7"/>
      <path d="M103 159h33v20h-33z" fill="#e8be62"/><path d="M119 157v24" stroke="#fff5c6" strokeWidth="3"/>
      <path d="M178 67h10V57h10v10h10v10h-10v10h-10V77h-10Z" fill="#e3be62" stroke="none"/>
    </g> : <g stroke="#586386" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="120" cy="197" rx="59" ry="9" fill="#8c9ac3" opacity=".2" stroke="none"/>
      <path d="m121 52 22 41 47 7-33 35 6 49-42-21-42 21 6-49-34-35 48-7Z" fill="#f9d783"/>
      <path d="m88 76 12-30 50 6 5 31Z" fill="#798daf"/><path d="m88 77 72 5" strokeWidth="8"/>
      <path d="M106 114v5m30-5v5m-21 10q6 7 12 0"/><path d="M95 130h7m38 0h7" stroke="#e8ad89" strokeWidth="5"/>
      <path d="m96 157 48-7 4 32-48 7Z" fill="#fff7e6"/><path d="m98 158 26 15 21-20"/>
      <path d="m178 55 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="#d6b66e" stroke="none"/>
    </g>}
  </svg>
}

