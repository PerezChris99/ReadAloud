@echo off
echo Installing ReadAloud dependencies...

REM Activate virtual environment
call env\Scripts\activate

REM Install PyQt5 first
echo Installing PyQt5...
pip install PyQt5 --no-warn-script-location

REM Try direct wheel download for PyMuPDF
echo Installing PyMuPDF binary wheel...
pip install --only-binary :all: PyMuPDF==1.21.1

REM If that fails, try alternative versions
if %ERRORLEVEL% NEQ 0 (
    echo Trying alternative PyMuPDF version...
    pip install --only-binary :all: PyMuPDF==1.20.0
)

REM Install remaining dependencies
echo Installing other dependencies...
pip install -r requirements.txt --no-deps --ignore-installed --no-warn-script-location

echo Dependencies installation complete.
pause
