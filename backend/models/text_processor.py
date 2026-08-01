"""
Advanced text processing module for DocStruct AI.
Handles text classification, structure detection, and semantic analysis.
"""

import re
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import spacy
from transformers import pipeline
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize, word_tokenize

class DocumentType(Enum):
    ACADEMIC = "academic"
    BUSINESS = "business"
    TECHNICAL = "technical"
    GENERAL = "general"

@dataclass
class DocumentStructure:
    sections: List[Dict]
    headings: List[Dict]
    subheadings: List[Dict]
    detected_types: List[str]
    confidence_scores: Dict[str, float]

class AdvancedTextProcessor:
    _shared_nlp = None
    _shared_text_classifier = None
    _shared_stop_words = None
    _resources_ready = False

    def __init__(self):
        if not AdvancedTextProcessor._resources_ready:
            AdvancedTextProcessor._shared_nlp = spacy.load("en_core_web_sm")
            AdvancedTextProcessor._shared_text_classifier = pipeline(
                "text-classification",
                model="distilbert-base-uncased-finetuned-sst-2-english"
            )

            nltk.download('punkt', quiet=True)
            nltk.download('stopwords', quiet=True)
            nltk.download('averaged_perceptron_tagger', quiet=True)

            AdvancedTextProcessor._shared_stop_words = set(stopwords.words('english'))
            AdvancedTextProcessor._resources_ready = True

        self.nlp = AdvancedTextProcessor._shared_nlp
        self.text_classifier = AdvancedTextProcessor._shared_text_classifier
        self.stop_words = AdvancedTextProcessor._shared_stop_words
        self.heading_type_patterns = {
            'introduction': ('introduction', 'intro', 'background'),
            'methodology': ('methodology', 'methods', 'approach'),
            'results': ('results', 'findings', 'analysis'),
            'conclusion': ('conclusion', 'summary', 'discussion'),
            'references': ('references', 'bibliography'),
            'abstract': ('abstract',),
        }
        
        # Document type patterns
        self.academic_patterns = {
            'introduction': ['introduction', 'intro', 'background', 'overview', 'preliminaries'],
            'methodology': ['methodology', 'methods', 'approach', 'procedure', 'experiment', 'design'],
            'results': ['results', 'findings', 'analysis', 'data', 'observations', 'evaluation'],
            'conclusion': ['conclusion', 'summary', 'discussion', 'implications', 'future work'],
            'references': ['references', 'bibliography', 'works cited', 'citations', 'literature review']
        }
        
        self.business_patterns = {
            'executive_summary': ['executive summary', 'summary', 'overview'],
            'market_analysis': ['market analysis', 'market research', 'industry analysis'],
            'financial_analysis': ['financial analysis', 'financial statements', 'profitability'],
            'recommendations': ['recommendations', 'conclusions', 'next steps']
        }

    def classify_document_type(self, text: str) -> DocumentType:
        """Classify document type using AI model"""
        try:
            # Use transformer model for classification
            result = self.text_classifier(text[:512])  # Limit text length for efficiency
            label = result[0]['label']
            
            # Map model labels to our document types
            type_mapping = {
                'POSITIVE': DocumentType.ACADEMIC,
                'NEGATIVE': DocumentType.BUSINESS,
                'NEUTRAL': DocumentType.GENERAL
            }
            
            return type_mapping.get(label, DocumentType.GENERAL)
        except Exception as e:
            print(f"Classification error: {e}")
            return DocumentType.GENERAL

    def detect_document_structure(self, text: str) -> DocumentStructure:
        """Advanced document structure detection"""
        structure = DocumentStructure(
            sections=[],
            headings=[],
            subheadings=[],
            detected_types=[],
            confidence_scores={}
        )
        
        # Process text with spaCy for better understanding
        doc = self.nlp(text)
        
        # Detect sections based on patterns
        lower_text = text.lower()
        
        # Academic patterns
        for section_type, patterns in self.academic_patterns.items():
            for pattern in patterns:
                if pattern in lower_text:
                    structure.detected_types.append(section_type)
                    confidence = self.calculate_pattern_confidence(pattern, text)
                    structure.confidence_scores[section_type] = confidence
                    
                    structure.sections.append({
                        'type': section_type,
                        'pattern': pattern,
                        'position': lower_text.index(pattern),
                        'confidence': confidence
                    })
        
        # Business patterns
        for section_type, patterns in self.business_patterns.items():
            for pattern in patterns:
                if pattern in lower_text:
                    structure.detected_types.append(section_type)
                    confidence = self.calculate_pattern_confidence(pattern, text)
                    structure.confidence_scores[section_type] = confidence
                    
                    structure.sections.append({
                        'type': section_type,
                        'pattern': pattern,
                        'position': lower_text.index(pattern),
                        'confidence': confidence
                    })
        
        # Advanced heading detection using spaCy
        for sent in doc.sents:
            if self.is_heading_sentence(sent.text):
                heading_info = {
                    'text': sent.text,
                    'position': sent.start,
                    'confidence': self.calculate_heading_confidence(sent.text),
                    'type': self.detect_heading_type(sent.text)
                }
                
                if len(sent.text) > 15:  # Main heading
                    structure.headings.append(heading_info)
                else:  # Subheading
                    structure.subheadings.append(heading_info)
        
        return structure

    def calculate_pattern_confidence(self, pattern: str, text: str) -> float:
        """Calculate confidence score for pattern detection"""
        pattern_lower = pattern.lower()
        text_lower = text.lower()
        
        # Count occurrences
        occurrences = text_lower.count(pattern_lower)
        
        # Calculate based on pattern specificity and text length
        base_confidence = min(occurrences * 0.3, 1.0)
        
        # Boost confidence for exact matches
        if pattern_lower in text_lower:
            base_confidence += 0.4
        
        # Consider text length
        text_length_factor = min(len(text) / 1000, 1.0)
        base_confidence *= (0.5 + 0.5 * text_length_factor)
        
        return min(base_confidence, 1.0)

    def is_heading_sentence(self, text: str) -> bool:
        """Determine if a sentence is likely a heading"""
        if not text or len(text.strip()) == 0:
            return False
        
        text = text.strip()
        
        # Check for heading characteristics
        conditions = [
            text[0].isupper(),  # Starts with capital letter
            len(text) < 100,    # Reasonable length
            not text.endswith('.'),  # No period (not a complete sentence)
            not any(char in text for char in '()[]{}'),  # No brackets
            not any(word in text.lower() for word in ['the ', 'and ', 'of ', 'in ', 'on ', 'at ']),  # Not common sentence starters
            any(char in text for char in ':'),  # Often contains colon
            not text.isupper()  # Not all caps (could be emphasis)
        ]
        
        return all(conditions)

    def calculate_heading_confidence(self, heading_text: str) -> float:
        """Calculate confidence score for heading detection"""
        confidence = 0.5  # Base confidence
        
        # Boost for capitalization
        if heading_text[0].isupper():
            confidence += 0.2
        
        # Boost for length (main headings are usually longer)
        if 10 <= len(heading_text) <= 50:
            confidence += 0.2
        
        # Boost for colon presence
        if ':' in heading_text:
            confidence += 0.1
        
        return min(confidence, 1.0)

    def detect_heading_type(self, heading_text: str) -> str:
        """Detect the type of heading"""
        text_lower = heading_text.lower()

        for heading_type, patterns in self.heading_type_patterns.items():
            if any(pattern in text_lower for pattern in patterns):
                return heading_type

        return 'general'

    def group_related_content(self, sentences: List[str], structure: DocumentStructure) -> Dict:
        """Group related content based on detected structure"""
        groups = {
            'introduction': [],
            'methodology': [],
            'results': [],
            'conclusion': [],
            'references': [],
            'abstract': [],
            'general': []
        }
        
        for sentence in sentences:
            lower_sentence = sentence.lower()
            assigned = False
            
            # Assign to appropriate section based on structure detection
            for section_type in structure.detected_types:
                if section_type in lower_sentence and not assigned:
                    groups[section_type].append(sentence)
                    assigned = True
                    break
            
            # Fallback to keyword-based assignment
            if not assigned:
                if any(word in lower_sentence for word in ['method', 'approach', 'procedure']):
                    groups['methodology'].append(sentence)
                    assigned = True
                elif any(word in lower_sentence for word in ['result', 'finding', 'analysis']):
                    groups['results'].append(sentence)
                    assigned = True
                elif any(word in lower_sentence for word in ['conclusion', 'summary', 'final']):
                    groups['conclusion'].append(sentence)
                    assigned = True
                elif any(word in lower_sentence for word in ['reference', 'cite', 'bibliography']):
                    groups['references'].append(sentence)
                    assigned = True
                elif any(word in lower_sentence for word in ['abstract', 'summary']):
                    groups['abstract'].append(sentence)
                    assigned = True
            
            if not assigned:
                groups['general'].append(sentence)
        
        return groups

    def process_text_advanced(self, text: str, doc_type: DocumentType = DocumentType.GENERAL) -> Dict:
        """Advanced text processing pipeline"""
        # Tokenize text
        sentences = sent_tokenize(text)
        words = word_tokenize(text)
        
        # Remove stopwords
        filtered_words = [word for word in words if word.lower() not in self.stop_words]
        
        # Detect document structure
        structure = self.detect_document_structure(text)
        
        # Group related content
        grouped_content = self.group_related_content(sentences, structure)
        
        # Apply formatting based on document type
        formatted_content = self.apply_formatting(grouped_content, doc_type)
        
        return {
            'original_text': text,
            'word_count': len(filtered_words),
            'sentence_count': len(sentences),
            'structure': structure,
            'grouped_content': grouped_content,
            'formatted_content': formatted_content,
            'document_type': doc_type.value
        }

    def apply_formatting(self, content: Dict, doc_type: DocumentType) -> Dict:
        """Apply formatting based on document type"""
        formatted = {}
        
        for section, sentences in content.items():
            if not sentences:
                continue
            
            section_text = ' '.join(sentences)
            
            # Determine formatting based on section and document type
            formatting_rules = self.get_formatting_rules(section, doc_type)
            
            formatted[section] = {
                'title': section.replace('_', ' ').title(),
                'content': section_text,
                'word_count': len(word_tokenize(section_text)),
                'sentence_count': len(sentences),
                'formatting': formatting_rules,
                'confidence': self.calculate_section_confidence(section, sentences)
            }
        
        return formatted

    def get_formatting_rules(self, section: str, doc_type: DocumentType) -> Dict:
        """Get formatting rules for a section and document type"""
        base_rules = {
            'font': 'Arial',
            'font_size': 11,
            'line_spacing': 1.5,
            'margins': {'top': 1, 'right': 1, 'bottom': 1, 'left': 1},
            'alignment': 'left',
            'indentation': 0.5,
            'spacing_after': 120
        }
        
        # Adjust based on document type
        if doc_type == DocumentType.ACADEMIC:
            base_rules.update({
                'font': 'Times New Roman',
                'font_size': 12,
                'line_spacing': 2.0,
                'margins': {'top': 2, 'right': 1.5, 'bottom': 2, 'left': 1.5},
                'indentation': 1.0
            })
        
        elif doc_type == DocumentType.BUSINESS:
            base_rules.update({
                'font': 'Calibri',
                'font_size': 11,
                'line_spacing': 1.15,
                'margins': {'top': 1, 'right': 1, 'bottom': 1, 'left': 1},
                'alignment': 'left',
                'spacing_after': 150
            })
        
        # Adjust based on section type
        if section in ['references', 'bibliography']:
            base_rules.update({
                'font_size': 10,
                'line_spacing': 1.0,
                'indentation': 1.5,
                'alignment': 'left'
            })
        
        elif section == 'abstract':
            base_rules.update({
                'font_size': 10,
                'line_spacing': 1.0,
                'indentation': 1.0,
                'alignment': 'center'
            })
        
        return base_rules

    def calculate_section_confidence(self, section: str, sentences: List[str]) -> float:
        """Calculate confidence score for section content"""
        if not sentences:
            return 0.0
        
        confidence = 0.5  # Base confidence
        
        # Boost for sentence count
        sentence_factor = min(len(sentences) / 10, 1.0)
        confidence += 0.3 * sentence_factor
        
        # Boost for content quality (simple heuristic)
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        if 10 <= avg_sentence_length <= 30:
            confidence += 0.1
        
        # Boost for section-specific keywords
        section_keywords = {
            'introduction': ['introduction', 'background', 'overview'],
            'methodology': ['method', 'approach', 'procedure'],
            'results': ['result', 'finding', 'analysis'],
            'conclusion': ['conclusion', 'summary', 'final'],
            'references': ['reference', 'cite', 'bibliography']
        }
        
        if section in section_keywords:
            keywords = section_keywords[section]
            keyword_matches = sum(1 for sent in sentences 
                                for keyword in keywords 
                                if keyword in sent.lower())
            if keyword_matches > 0:
                confidence += 0.1 * min(keyword_matches / len(sentences), 1.0)
        
        return min(confidence, 1.0)