use crate::error::{AppError, AppResult};
use serde_json::Value;

pub struct ModelGeneratorService;

impl ModelGeneratorService {
    pub fn generate_model(framework: &str, table: &str, columns: &[Value]) -> AppResult<String> {
        match framework.to_lowercase().as_str() {
            "mongoose" => Ok(Self::generate_mongoose(table, columns)),
            "typeorm" => Ok(Self::generate_typeorm(table, columns)),
            "prisma" => Ok(Self::generate_prisma(table, columns)),
            "sequelize" => Ok(Self::generate_sequelize(table, columns)),
            _ => Err(AppError::Validation(format!("Unsupported framework: {}", framework))),
        }
    }

    fn map_type_to_ts(sql_type: &str) -> &'static str {
        let t = sql_type.to_lowercase();
        if t.contains("int") || t.contains("float") || t.contains("double") || t.contains("decimal") || t.contains("numeric") {
            "number"
        } else if t.contains("bool") || t.contains("tinyint(1)") {
            "boolean"
        } else if t.contains("date") || t.contains("time") || t.contains("timestamp") {
            "Date"
        } else {
            "string"
        }
    }

    fn generate_mongoose(table: &str, columns: &[Value]) -> String {
        let mut out = String::new();
        out.push_str("import { Schema, model, Document } from 'mongoose';\n\n");
        let class_name = Self::to_pascal_case(table);
        
        out.push_str(&format!("export interface I{} extends Document {{\n", class_name));
        for col in columns {
            let name = col["name"].as_str().unwrap_or("");
            let sql_type = col["type"].as_str().unwrap_or("");
            let ts_type = Self::map_type_to_ts(sql_type);
            let is_nullable = col["isNullable"].as_bool().unwrap_or(false);
            let optional = if is_nullable { "?" } else { "" };
            out.push_str(&format!("  {}{}: {};\n", name, optional, ts_type));
        }
        out.push_str("}\n\n");

        out.push_str(&format!("const {}Schema = new Schema<I{}>({{\n", class_name, class_name));
        for col in columns {
            let name = col["name"].as_str().unwrap_or("");
            if name == "id" || name == "_id" { continue; }
            let sql_type = col["type"].as_str().unwrap_or("");
            let ts_type = Self::map_type_to_ts(sql_type);
            let mongoose_type = match ts_type {
                "number" => "Number",
                "boolean" => "Boolean",
                "Date" => "Date",
                _ => "String",
            };
            let is_nullable = col["isNullable"].as_bool().unwrap_or(false);
            let required = if is_nullable { "false" } else { "true" };
            out.push_str(&format!("  {}: {{ type: {}, required: {} }},\n", name, mongoose_type, required));
        }
        out.push_str("});\n\n");
        
        out.push_str(&format!("export const {} = model<I{}>('{}', {}Schema);\n", class_name, class_name, class_name, class_name));
        out
    }

    fn generate_typeorm(table: &str, columns: &[Value]) -> String {
        let mut out = String::new();
        out.push_str("import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';\n\n");
        let class_name = Self::to_pascal_case(table);
        
        out.push_str(&format!("@Entity('{}')\n", table));
        out.push_str(&format!("export class {} {{\n", class_name));
        for col in columns {
            let name = col["name"].as_str().unwrap_or("");
            let sql_type = col["type"].as_str().unwrap_or("");
            let ts_type = Self::map_type_to_ts(sql_type);
            let is_pk = col["isPrimaryKey"].as_bool().unwrap_or(false);
            let is_nullable = col["isNullable"].as_bool().unwrap_or(false);
            
            if is_pk {
                out.push_str("  @PrimaryGeneratedColumn()\n");
            } else {
                let nullable_str = if is_nullable { "{ nullable: true }" } else { "" };
                out.push_str(&format!("  @Column({})\n", nullable_str));
            }
            let optional = if is_nullable { "?" } else { "!" };
            out.push_str(&format!("  {}{}: {};\n\n", name, optional, ts_type));
        }
        out.push_str("}\n");
        out
    }

    fn generate_prisma(table: &str, columns: &[Value]) -> String {
        let mut out = String::new();
        let class_name = Self::to_pascal_case(table);
        out.push_str(&format!("model {} {{\n", class_name));
        
        for col in columns {
            let name = col["name"].as_str().unwrap_or("");
            let sql_type = col["type"].as_str().unwrap_or("");
            let is_pk = col["isPrimaryKey"].as_bool().unwrap_or(false);
            let is_nullable = col["isNullable"].as_bool().unwrap_or(false);
            
            let prisma_type = match Self::map_type_to_ts(sql_type) {
                "number" => {
                    if sql_type.to_lowercase().contains("float") || sql_type.to_lowercase().contains("double") || sql_type.to_lowercase().contains("decimal") {
                        "Float"
                    } else {
                        "Int"
                    }
                },
                "boolean" => "Boolean",
                "Date" => "DateTime",
                _ => "String",
            };
            
            let mut decorators = vec![];
            if is_pk { decorators.push("@id @default(autoincrement())"); }
            let optional = if is_nullable && !is_pk { "?" } else { "" };
            
            let dec_str = if decorators.is_empty() { "".to_string() } else { format!(" {}", decorators.join(" ")) };
            out.push_str(&format!("  {} {}{}{}\n", name, prisma_type, optional, dec_str));
        }
        
        out.push_str(&format!("  @@map(\"{}\")\n", table));
        out.push_str("}\n");
        out
    }

    fn generate_sequelize(table: &str, columns: &[Value]) -> String {
        let mut out = String::new();
        out.push_str("import { DataTypes, Model } from 'sequelize';\n");
        out.push_str("import sequelize from './database'; // Adjust path as needed\n\n");
        let class_name = Self::to_pascal_case(table);
        
        out.push_str(&format!("export class {} extends Model {{}}\n\n", class_name));
        out.push_str(&format!("{}.init({{\n", class_name));
        
        for col in columns {
            let name = col["name"].as_str().unwrap_or("");
            let sql_type = col["type"].as_str().unwrap_or("");
            let is_pk = col["isPrimaryKey"].as_bool().unwrap_or(false);
            let is_nullable = col["isNullable"].as_bool().unwrap_or(false);
            
            let seq_type = match Self::map_type_to_ts(sql_type) {
                "number" => {
                    if sql_type.to_lowercase().contains("float") || sql_type.to_lowercase().contains("double") {
                        "DataTypes.FLOAT"
                    } else if sql_type.to_lowercase().contains("decimal") {
                        "DataTypes.DECIMAL"
                    } else {
                        "DataTypes.INTEGER"
                    }
                },
                "boolean" => "DataTypes.BOOLEAN",
                "Date" => "DataTypes.DATE",
                _ => "DataTypes.STRING",
            };
            
            out.push_str(&format!("  {}: {{\n", name));
            out.push_str(&format!("    type: {},\n", seq_type));
            if is_pk {
                out.push_str("    primaryKey: true,\n");
                out.push_str("    autoIncrement: true,\n");
            }
            if !is_nullable && !is_pk {
                out.push_str("    allowNull: false,\n");
            }
            out.push_str("  },\n");
        }
        
        out.push_str(&format!("}}, {{\n  sequelize,\n  modelName: '{}',\n  tableName: '{}',\n  timestamps: false,\n}});\n", class_name, table));
        out
    }

    fn to_pascal_case(s: &str) -> String {
        let mut result = String::new();
        let mut capitalize_next = true;
        for c in s.chars() {
            if c == '_' || c == '-' {
                capitalize_next = true;
            } else if capitalize_next {
                result.push(c.to_ascii_uppercase());
                capitalize_next = false;
            } else {
                result.push(c.to_ascii_lowercase());
            }
        }
        result
    }
}
