@echo off
echo Reinstalling PyMuPDF to fix import errors...

REM Activate the virtual environment
call env\Scripts\activate

REM Uninstall existing PyMuPDF
python -m pip uninstall -y PyMuPDF pymupdf-fonts

REM Reinstall PyMuPDF with specific version
python -m pip install PyMuPDF==1.21.1

echo Reinstallation complete!
echo Try running the application again using run.bat

pause
