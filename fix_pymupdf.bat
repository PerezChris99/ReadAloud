@echo off
echo Fixing PyMuPDF installation...

REM Activate the virtual environment
call env\Scripts\activate

REM Uninstall any existing PyMuPDF installation
python -m pip uninstall -y PyMuPDF fitz pymupdf

REM Install PyMuPDF properly
python -m pip install pymupdf==1.22.5

echo PyMuPDF fixed! You should now be able to run the application.
pause
