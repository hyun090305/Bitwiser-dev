param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Paths
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-LabelFontFamily {
  $installed = [System.Drawing.Text.InstalledFontCollection]::new()
  try {
    foreach ($family in $installed.Families) {
      if ($family.Name -eq 'Noto Sans KR') {
        return $family
      }
    }
  } finally {
    $installed.Dispose()
  }
  return [System.Drawing.FontFamily]::GenericSansSerif
}

$fontFamily = Get-LabelFontFamily

foreach ($path in $Paths) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Icon path not found: $path"
  }

  $source = [System.Drawing.Bitmap]::FromFile($path)
  try {
    $bitmap = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
      $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)

      $scale = $source.Width / 1024
      $cell = 900 * $scale
      $centerX = $source.Width / 2
      $centerY = $source.Height / 2 + $cell * 0.015
      $fontSize = [Math]::Round($cell * 0.34)

      $font = New-Object System.Drawing.Font $fontFamily, $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
      $format = New-Object System.Drawing.StringFormat
      $format.Alignment = [System.Drawing.StringAlignment]::Center
      $format.LineAlignment = [System.Drawing.StringAlignment]::Center

      $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 224, 242, 254))
      $rect = [System.Drawing.RectangleF]::new($centerX - $cell / 2, $centerY - $cell / 2, $cell, $cell)

      $graphics.DrawString('AND', $font, $textBrush, $rect, $format)

      $font.Dispose()
      $format.Dispose()
      $textBrush.Dispose()
    } finally {
      $graphics.Dispose()
    }
  } finally {
    $source.Dispose()
  }

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}
