<# 
.SYNOPSIS
    Clones required data/model files from project-code/ into app/ for self-contained deployment.
.DESCRIPTION
    Run this from the app/ directory. It copies all data files that the backend needs
    from the parent project-code/ directory structure into app/data, app/saved_model, etc.
#>

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot | Split-Path  # app/
$ProjectRoot = $AppDir | Split-Path   # project-code/

Write-Host "Cloning data into $AppDir ..." -ForegroundColor Cyan

# Create directories
$dirs = @(
    "$AppDir\data\processed",
    "$AppDir\data\users",
    "$AppDir\data\books_vector_v2",
    "$AppDir\saved_model",
    "$AppDir\results_v2"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# CSV data
Write-Host "  [1/5] Copying CSV data files ..."
Copy-Item "$ProjectRoot\data\processed\books_enriched_with_type.csv" "$AppDir\data\processed\" -Force
Copy-Item "$ProjectRoot\data\processed\transactions_enriched.csv" "$AppDir\data\processed\" -Force
Copy-Item "$ProjectRoot\data\users\all_users.csv" "$AppDir\data\users\" -Force

# FAISS indices
Write-Host "  [2/5] Copying FAISS vector indices ..."
Copy-Item "$ProjectRoot\data\books_vector_v2\*.faiss" "$AppDir\data\books_vector_v2\" -Force

# Model artifacts
Write-Host "  [3/5] Copying model artifacts ..."
Copy-Item "$ProjectRoot\saved_model\recsys_artifacts.pkl" "$AppDir\saved_model\" -Force
Copy-Item "$ProjectRoot\saved_model\item_embeddings.npy" "$AppDir\saved_model\" -Force

# Model weights (large file ~330MB)
Write-Host "  [4/5] Copying model weights (this may take a moment) ..."
Copy-Item "$ProjectRoot\saved_model\best_sasrec_weights.weights.h5" "$AppDir\saved_model\" -Force

# Evaluation metrics
Write-Host "  [5/5] Copying evaluation metrics ..."
Copy-Item "$ProjectRoot\results_v2\evaluation_metrics_l_2_h_1_hd_1024_trainable_True_lr_0.0001.csv" "$AppDir\results_v2\" -Force

Write-Host "`nDone! All data cloned into $AppDir" -ForegroundColor Green

# Verify
$totalMB = [math]::Round(((Get-ChildItem "$AppDir\data","$AppDir\saved_model","$AppDir\results_v2" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host "Total cloned data size: ${totalMB} MB" -ForegroundColor Yellow
