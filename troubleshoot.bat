@echo off
echo ReadAloud Troubleshooting Tool
echo =============================
echo.

REM Activate virtual environment
call env\Scripts\activate

echo Checking Python installation...
python --version
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python from https://www.python.org/downloads/
    goto end
)

echo.
echo Checking pip installation...
pip --version
if %errorlevel% neq 0 (
    echo ERROR: pip is not installed correctly.
    echo Try reinstalling Python with pip included.
    goto end
)

echo.
echo Checking for PyQt5...
pip show PyQt5
if %errorlevel% neq 0 (
    echo Attempting to install PyQt5...
    pip install PyQt5==5.15.6
)

echo.
echo Checking for PyMuPDF...
pip show PyMuPDF
if %errorlevel% neq 0 (
    echo Attempting to install PyMuPDF...
    echo "Note: Using an older stable version to avoid build issues."
    pip install PyMuPDF==1.19.6
)

echo.
echo Checking Tesseract OCR installation...
where tesseract >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Tesseract OCR not found. Image recognition will not work.
    echo Please install Tesseract OCR from https://github.com/UB-Mannheim/tesseract/wiki
) else (
    echo Tesseract OCR found at:
    where tesseract
)

echo.
echo If you're still having issues, try installing from the alternate requirements:
echo pip install -r alternate_requirements.txt
echo.

echo Troubleshooting complete.
echo If problems persist, consider manually installing each package one by one.

:end
deactivate
pause
