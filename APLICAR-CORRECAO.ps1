# MB REFERENCIAS — correção das janelas de fotos e edição
# Execute este script na pasta raiz do repositório (a pasta que contém package.json).
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Replace-Once {
    param(
        [string]$Content,
        [string]$Old,
        [string]$New,
        [string]$Label
    )
    $count = 0
    $position = 0
    while ($true) {
        $index = $Content.IndexOf($Old, $position, [System.StringComparison]::Ordinal)
        if ($index -lt 0) { break }
        $count++
        $position = $index + $Old.Length
    }
    if ($count -ne 1) {
        throw "Não apliquei '$Label': encontrei $count ocorrência(s) do trecho esperado. Nenhum arquivo foi gravado. Confira se o repositório é a versão atual."
    }
    return $Content.Replace($Old, $New)
}

function Replace-RegexOnce {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Replacement,
        [string]$Label
    )
    $regex = [regex]::new($Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $foundMatches = $regex.Matches($Content)
    if ($foundMatches.Count -ne 1) {
        throw "Não apliquei '$Label': encontrei $($foundMatches.Count) ocorrência(s) do trecho esperado. Nenhum arquivo foi gravado. Confira se o repositório é a versão atual."
    }
    $match = $foundMatches[0]
    return $Content.Substring(0, $match.Index) + $Replacement + $Content.Substring($match.Index + $match.Length)
}

# Carrega tudo primeiro. Só grava os arquivos depois que todas as substituições
# foram conferidas, para evitar uma correção pela metade.
$files = @{}
$paths = @(
    "src/App.tsx",
    "src/ModelPhotos.tsx",
    "src/PhotoLightbox.tsx",
    "src/SampleWorkflow.tsx",
    "src/styles.css"
)
foreach ($relative in $paths) {
    $full = Join-Path $Root $relative
    if (-not (Test-Path $full)) { throw "Arquivo não encontrado: $relative. Coloque o script na raiz do projeto." }
    $files[$relative] = [System.IO.File]::ReadAllText($full)
}

# 1) Todos os modais do aplicativo: portal fora da área animada.
$old = "import { lazy, Suspense, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent } from 'react';"
$new = $old + "`nimport { createPortal } from 'react-dom';"
$files["src/App.tsx"] = Replace-Once $files["src/App.tsx"] $old $new "import createPortal em App.tsx"

$old = @'
{modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)resetModal()}}><section className={`modal ${modal==='import'||modal==='users'||modal==='history'?'modal-wide':''}`} role="dialog" aria-modal="true">
'@
$old = $old.TrimEnd("`r","`n")
$new = $old.Replace("{modal&&<div", "{modal&&createPortal(<div")
$files["src/App.tsx"] = Replace-Once $files["src/App.tsx"] $old $new "portal do modal principal"
$files["src/App.tsx"] = Replace-Once $files["src/App.tsx"] "</section></div>}" "</section></div>, document.body)}" "fechamento do portal principal"

# 2) Janela de foto do catálogo também fica fora da tela animada.
$old = "import { useMemo, useRef, useState } from 'react';"
$new = $old + "`nimport { createPortal } from 'react-dom';"
$files["src/ModelPhotos.tsx"] = Replace-Once $files["src/ModelPhotos.tsx"] $old $new "import createPortal em ModelPhotos.tsx"

$old = @'
{selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="modal production-modal" role="dialog" aria-modal="true">
'@
$old = $old.TrimEnd("`r","`n")
$new = $old.Replace("{selected&&<div", "{selected&&createPortal(<div")
$files["src/ModelPhotos.tsx"] = Replace-Once $files["src/ModelPhotos.tsx"] $old $new "portal da janela de foto do catálogo"
$files["src/ModelPhotos.tsx"] = Replace-Once $files["src/ModelPhotos.tsx"] "</section></div>}" "</section></div>, document.body)}" "fechamento da janela de foto do catálogo"

# 3) O visualizador de fotos é usado tanto no Catálogo quanto em Amostras/Cortes.
$old = "import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';"
$new = $old + "`nimport { createPortal } from 'react-dom';"
$files["src/PhotoLightbox.tsx"] = Replace-Once $files["src/PhotoLightbox.tsx"] $old $new "import createPortal em PhotoLightbox.tsx"

$old = 'return <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Visualizar fotos: ${title}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>'
$new = $old.Replace("return <div", "return createPortal(<div")
$files["src/PhotoLightbox.tsx"] = Replace-Once $files["src/PhotoLightbox.tsx"] $old $new "portal do visualizador de fotos"
$files["src/PhotoLightbox.tsx"] = Replace-Once $files["src/PhotoLightbox.tsx"] "  </div>;" "  </div>, document.body);" "fechamento do visualizador de fotos"

# 4) A edição de Amostras aparece imediatamente. Se a leitura das fotos extras
# falhar, a foto principal permanece no formulário e Salvar fica bloqueado,
# evitando apagar imagens que não puderam ser carregadas.
$old = "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';"
$new = $old + "`nimport { createPortal } from 'react-dom';"
$files["src/SampleWorkflow.tsx"] = Replace-Once $files["src/SampleWorkflow.tsx"] $old $new "import createPortal em SampleWorkflow.tsx"

$newOpenEdit = @'
  const openEdit = async (p: Production) => {
    if (busy) return;
    // Mostra a janela imediatamente; a consulta das fotos extras acontece depois.
    setEditing(p); setOc(p.oc); setName(p.name); setReference(p.reference); setTailor(p.tailor);
    setImageGallery(p.imageData ? [p.imageData] : []);
    setPhotoError('');
    setGalleryLoaded(false);
    setModal(true);
    setBusy(true);
    try {
      const [photo2, photo3] = await Promise.all([
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_2')),
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_3'))
      ]);
      const extras = [photo2, photo3].map(snap => snap.exists() ? String(snap.data().imageData || '') : '').filter(Boolean);
      setImageGallery([...(p.imageData ? [p.imageData] : []), ...extras].slice(0, MAX_SAMPLE_PHOTOS));
      setGalleryLoaded(true);
    } catch (e) {
      // Não libera salvar sem ler a galeria completa, para não perder fotos extras.
      setPhotoError('A janela abriu, mas não foi possível carregar as fotos adicionais desta OC. A foto principal foi preservada e o salvamento está bloqueado para evitar perda de imagens. Confira as regras do Firestore e tente novamente. ' + productionError(e));
      setGalleryLoaded(false);
    } finally { setBusy(false); }
  };
'@
$pattern = '(?m)^  const openEdit = async \(p: Production\) => \{.*?^  \};'
$files["src/SampleWorkflow.tsx"] = Replace-RegexOnce $files["src/SampleWorkflow.tsx"] $pattern $newOpenEdit "abertura segura da edição de amostras"

$old = '{photoError&&<div className="production-alert" role="alert">{photoError}</div>}'
$new = '{busy&&!galleryLoaded&&<small>Carregando fotos da amostra...</small>}{photoError&&<div className="production-alert" role="alert">{photoError}</div>}'
$files["src/SampleWorkflow.tsx"] = Replace-Once $files["src/SampleWorkflow.tsx"] $old $new "aviso de carregamento da galeria"

$old = @'
{modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><section className="modal production-modal" role="dialog" aria-modal="true">
'@
$old = $old.TrimEnd("`r","`n")
$new = $old.Replace("{modal&&<div", "{modal&&createPortal(<div")
$files["src/SampleWorkflow.tsx"] = Replace-Once $files["src/SampleWorkflow.tsx"] $old $new "portal do formulário de amostras"
$files["src/SampleWorkflow.tsx"] = Replace-Once $files["src/SampleWorkflow.tsx"] "</section></div>}" "</section></div>, document.body)}" "fechamento do formulário de amostras"

# 5) Camadas acima do cabeçalho, menu lateral e telas com animação.
$cssAddition = @'

/* MB REFERENCIAS 5.1 — janelas fora das áreas animadas */
.modal-backdrop {
  z-index: 10000 !important;
  isolation: isolate;
}
.modal-backdrop > .modal {
  position: relative;
  z-index: 1;
}
.photo-lightbox {
  z-index: 10001 !important;
  width: 100vw;
  height: 100dvh;
}
body:has(.modal-backdrop),
body:has(.photo-lightbox) {
  overflow: hidden;
}
@media (max-width: 600px) {
  .modal-backdrop { padding: 10px; }
  .modal-backdrop > .modal {
    width: 100%;
    max-height: calc(100dvh - 20px);
  }
}
'@
$files["src/styles.css"] = $files["src/styles.css"].TrimEnd() + $cssAddition + "`n"

# Backups e gravação só depois de validar todos os trechos.
foreach ($relative in $paths) {
    $full = Join-Path $Root $relative
    $backup = $full + ".before-modal-fix.bak"
    if (-not (Test-Path $backup)) {
        [System.IO.File]::Copy($full, $backup)
    }
}
foreach ($relative in $paths) {
    $full = Join-Path $Root $relative
    [System.IO.File]::WriteAllText($full, $files[$relative], $Utf8NoBom)
    Write-Host "Corrigido: $relative" -ForegroundColor Green
}

Write-Host ""
Write-Host "Correção aplicada. Os arquivos originais foram guardados como .before-modal-fix.bak." -ForegroundColor Green
Write-Host "Agora envie as alterações para a branch main pelo GitHub Desktop e aguarde o GitHub Actions." -ForegroundColor Cyan
