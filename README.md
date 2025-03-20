# ReadAloud Application

ReadAloud is a document reader application that converts text from various document formats to speech.

## Supported Formats

- PDF files (.pdf)
- Microsoft Word documents (.docx)
- Text files (.txt)
- EPUB books (.epub)
- Images (.jpg, .png) with text recognition

## Installation

### Prerequisites
- Python 3.8 or newer
- Tesseract OCR (for image text recognition)

### Automatic Installation
1. Run the `install.bat` script to:
   - Create a virtual environment (if not already created)
   - Install all required dependencies
   - Check for Tesseract OCR installation

### Manual Installation (if automatic installation fails)
1. Create a virtual environment:
   ```
   python -m venv env
   ```
2. Activate the virtual environment:
   ```
   env\Scripts\activate
   ```
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
   If that fails, try:
   ```
   pip install -r alternate_requirements.txt
   ```
   
### Tesseract OCR Installation
For image text recognition (OCR) to work:
1. Download from: https://github.com/UB-Mannheim/tesseract/wiki
2. During installation, check "Add to PATH" option
3. Default installation path is typically: `C:\Program Files\Tesseract-OCR`

## Usage

1. Run the application using `run.bat`
2. Click "Browse..." to select a document
3. The text content will be displayed in the application window
4. Adjust voice and rate settings as desired
5. Click "Play" to start reading the document aloud
6. Use "Pause" and "Stop" buttons to control playback

## Troubleshooting

If you encounter installation issues:
1. Run `troubleshoot.bat` to diagnose common problems
2. Try installing an older version of PyMuPDF: `pip install PyMuPDF==1.19.6`
3. Make sure your Python version is compatible with the libraries

For image recognition issues, ensure Tesseract OCR is properly installed and available in your system PATH.
