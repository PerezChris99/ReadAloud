import os
import fitz  # PyMuPDF
from docx import Document
import pytesseract
from PIL import Image
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

class TextExtractor:
    def __init__(self):
        # Configure pytesseract path if needed
        # pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        pass
        
    def extract_text(self, file_path):
        """Extract text from various file formats"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
            
        file_extension = os.path.splitext(file_path)[1].lower()
        
        if file_extension == '.pdf':
            return self.extract_from_pdf(file_path)
        elif file_extension == '.docx':
            return self.extract_from_docx(file_path)
        elif file_extension == '.txt':
            return self.extract_from_txt(file_path)
        elif file_extension == '.epub':
            return self.extract_from_epub(file_path)
        elif file_extension in ['.png', '.jpg', '.jpeg']:
            return self.extract_from_image(file_path)
        else:
            raise ValueError(f"Unsupported file format: {file_extension}")
    
    def extract_from_pdf(self, file_path):
        """Extract text from PDF using PyMuPDF"""
        try:
            text = ""
            with fitz.open(file_path) as doc:
                for page in doc:
                    text += page.get_text()
            return text
        except Exception as e:
            raise Exception(f"Error extracting text from PDF: {str(e)}")
    
    def extract_from_docx(self, file_path):
        """Extract text from DOCX using python-docx"""
        try:
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            raise Exception(f"Error extracting text from DOCX: {str(e)}")
    
    def extract_from_txt(self, file_path):
        """Extract text from TXT file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                return file.read()
        except UnicodeDecodeError:
            # Try with a different encoding if UTF-8 fails
            with open(file_path, 'r', encoding='latin-1') as file:
                return file.read()
        except Exception as e:
            raise Exception(f"Error extracting text from TXT: {str(e)}")
    
    def extract_from_epub(self, file_path):
        """Extract text from EPUB using ebooklib"""
        try:
            book = epub.read_epub(file_path)
            text = ""
            
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    # Parse HTML content
                    soup = BeautifulSoup(item.get_content(), 'html.parser')
                    content_text = soup.get_text()
                    text += content_text + "\n"
                    
            return text
        except Exception as e:
            raise Exception(f"Error extracting text from EPUB: {str(e)}")
    
    def extract_from_image(self, file_path):
        """Extract text from image using pytesseract OCR"""
        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            raise Exception(f"Error extracting text from image: {str(e)}")
