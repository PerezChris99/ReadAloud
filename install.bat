@echo off
echo Installing ReadAloud application dependencies...
echo This may take a few minutes...

REM Create virtual environment if it doesn't exist
if not exist env (
    echo Creating virtual environment...
    python -m venv env
)

REM Activate the virtual environment
call env\Scripts\activate

REM Install dependencies
python -m pip install --upgrade pip
echo Installing requirements...
python -m pip install -r requirements.txt

REM Check if Tesseract OCR is installed
where tesseract >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Tesseract OCR not found. Image recognition will not work.
    echo Please install Tesseract OCR from https://github.com/UB-Mannheim/tesseract/wiki
    echo After installation, add the Tesseract installation directory to your system PATH.
    pause
)

echo Installation complete!
echo Run the application using run.bat

REM Keep the virtual environment active if user wants to run immediately
choice /C YN /M "Do you want to run the application now?"
if %errorlevel% equ 1 (
    call run.bat
) else (
    deactivate
    pause
)
