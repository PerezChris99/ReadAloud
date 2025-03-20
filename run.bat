@echo off
echo Starting ReadAloud application...

REM Activate virtual environment
call env\Scripts\activate

REM Check if dependencies are installed and install them if needed
echo Checking dependencies...

REM Try to install PyQt5 first as it's most critical
pip install PyQt5 --no-warn-script-location

REM Install pre-built wheels for problematic packages first
echo Installing pre-built wheels for complex dependencies...
pip install --only-binary :all: PyMuPDF==1.21.1

REM Install remaining dependencies
echo Installing other required dependencies...
pip install -r requirements.txt --no-deps --ignore-installed --no-warn-script-location

REM Run the application
python main.py


pause

